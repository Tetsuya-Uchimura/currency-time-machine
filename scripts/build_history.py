"""Build the static exchange-rate history bundled with Currency Time Machine.

Exchange rate data: Frankfurter (frankfurter.dev).

Rules this script follows (see the project brief):
  * Only the default *composite* (blended) rates are used. We never pass the
    `providers` parameter and never call `/v2/providers/...` endpoints.
  * History is fetched once at build time and written to static JSON
    (`public/data/history.json`). The app never calls the API for history.
  * A "today" snapshot (`public/data/snapshot.json`) is also written; the app
    falls back to it whenever the live `/api/today` endpoint is unavailable.

Why we resample daily data ourselves instead of using `group=week`:
  the API's weekly buckets include a partial bucket dated YYYY-01-01 whose
  values can be off (e.g. AUD 1.66 on 2000-01-01 vs ~1.537 in the daily data).
  Sampling the daily series on a fixed 7-day grid avoids that artefact.

Usage:
  python scripts/build_history.py            # use cached raw chunks when present
  python scripts/build_history.py --refresh  # re-download every chunk
  python scripts/build_history.py --offline  # never touch the network
"""

from __future__ import annotations

import argparse
import bisect
import datetime as dt
import json
import math
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterable

API = "https://api.frankfurter.dev/v2"
BASE = "USD"
ATTRIBUTION = "Exchange rate data: Frankfurter (frankfurter.dev)"

# Each "slot" is one glowing orb in the experience. The EUR slot is carried by
# the Deutsche Mark until the euro launches, then handed over to EUR.
EURO_SWITCH = dt.date(1999, 1, 1)
SLOTS: dict[str, list[str]] = {
    "EUR": ["DEM", "EUR"],
    "GBP": ["GBP"],
    "CHF": ["CHF"],
    "CAD": ["CAD"],
    "JPY": ["JPY"],
    "AUD": ["AUD"],
    "INR": ["INR"],
    "CNY": ["CNY"],
    "KRW": ["KRW"],
}
# Currencies shown in the "today" ending (real codes, no legacy currencies).
TODAY_CODES = ["EUR", "GBP", "CHF", "CAD", "JPY", "AUD", "INR", "CNY", "KRW"]

HISTORY_START = dt.date(1948, 1, 1)
STEP_DAYS = 7
# A grid date takes the latest observation within this many days before it.
MAX_STALENESS_DAYS = 10
# Interior holes longer than this many weeks are treated as a data error.
MAX_GAP_WEEKS = 8
# A single-week move larger than this (in natural-log terms, ~65%) is almost
# certainly a redenomination or data artefact rather than a market move. The
# largest genuine one in our set is CNY's 1994 unification (~0.40).
MAX_WEEKLY_LOG_MOVE = 0.5
# Official DEM per EUR conversion rate; only used to sanity-check the chain
# factor that we derive from the data itself.
DEM_PER_EUR_OFFICIAL = 1.95583

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data-raw"
OUT_DIR = ROOT / "public" / "data"

Series = dict[dt.date, float]


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------

def all_codes() -> list[str]:
    codes: list[str] = []
    for members in SLOTS.values():
        for c in members:
            if c not in codes:
                codes.append(c)
    return codes


CHUNK_YEARS = 5


def year_chunks(start: dt.date, end: dt.date, years: int = CHUNK_YEARS) -> list[tuple[dt.date, dt.date]]:
    """Split [start, end] into aligned multi-year chunks (keeps each request light).

    Large ranges make the API time out (HTTP 520/522), so we stay small.
    """
    chunks = []
    cur = start
    while cur <= end:
        nxt = dt.date((cur.year // years + 1) * years, 1, 1)
        chunk_end = min(nxt - dt.timedelta(days=1), end)
        chunks.append((cur, chunk_end))
        cur = nxt
    return chunks


# Pause between requests so we stay well inside the API's rate limit.
POLITE_DELAY_S = 3.0


class RateLimited(Exception):
    pass


def http_get_json(url: str, retries: int = 2, rate_limit_retries: int = 5) -> object:
    req = urllib.request.Request(url, headers={"User-Agent": "currency-time-machine-build/1.0"})
    attempt = limited = 0
    while True:
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                # Rate limited: wait (honouring Retry-After) instead of hammering.
                limited += 1
                if limited > rate_limit_retries:
                    raise RateLimited(url) from exc
                wait = float(exc.headers.get("Retry-After") or 30 * limited)
                print(f"  429 rate limited; waiting {wait:.0f}s", file=sys.stderr, flush=True)
                time.sleep(wait)
                continue
            attempt += 1
            if attempt >= retries:
                raise
            print(f"  retry after error: {exc}", file=sys.stderr, flush=True)
            time.sleep(5 * attempt)
        except (urllib.error.URLError, TimeoutError) as exc:
            attempt += 1
            if attempt >= retries:
                raise
            print(f"  retry after error: {exc}", file=sys.stderr, flush=True)
            time.sleep(5 * attempt)


def fetch_range(quotes: str, a: dt.date, b: dt.date) -> list[dict]:
    """Fetch one date range; on repeated server errors, split it in half."""
    # Composite rates only: no `providers` parameter, ever.
    url = f"{API}/rates?base={BASE}&quotes={quotes}&from={a}&to={b}"
    time.sleep(POLITE_DELAY_S)
    try:
        data = http_get_json(url)
    except (urllib.error.URLError, TimeoutError):
        # Server errors / timeouts on a long range: retry as two halves.
        if (b - a).days < 120:
            raise
        mid = a + (b - a) / 2
        print(f"  splitting {a} .. {b}", file=sys.stderr)
        return fetch_range(quotes, a, mid) + fetch_range(quotes, mid + dt.timedelta(days=1), b)
    assert isinstance(data, list), f"unexpected response for {a}..{b}"
    return data


def fetch_daily(today: dt.date, refresh: bool, offline: bool) -> list[dict]:
    """Return raw daily records for every code, using a per-chunk file cache."""
    RAW_DIR.mkdir(exist_ok=True)
    quotes = ",".join(all_codes())
    records: list[dict] = []
    chunks = year_chunks(HISTORY_START, today)
    for i, (a, b) in enumerate(chunks):
        is_current = i == len(chunks) - 1  # the open-ended chunk changes daily
        # The current chunk's file name has no end date so stale copies get replaced.
        name = f"daily_{a.isoformat()}_{'latest' if is_current else b.isoformat()}.json"
        cache = RAW_DIR / name
        if cache.exists() and (offline or not (refresh or is_current)):
            data = json.loads(cache.read_text(encoding="utf-8"))
        else:
            if offline:
                raise SystemExit(f"--offline but cache missing: {cache.name}")
            t0 = time.time()
            print(f"fetch {a} .. {b}", flush=True)
            data = fetch_range(quotes, a, b)
            print(f"  {len(data)} records in {time.time() - t0:.0f}s", flush=True)
            cache.write_text(json.dumps(data), encoding="utf-8")
        records.extend(data)
    return records


# ---------------------------------------------------------------------------
# Pure transformations (unit-tested in tests/test_build_history.py)
# ---------------------------------------------------------------------------

def parse_records(records: Iterable[dict], base: str = BASE) -> dict[str, Series]:
    """Group API records into {quote: {date: rate}}; drop identity/invalid rows."""
    out: dict[str, Series] = {}
    for r in records:
        if r.get("base") != base or r.get("quote") == base:
            continue
        rate = r.get("rate")
        if not isinstance(rate, (int, float)) or not rate > 0:
            continue
        out.setdefault(r["quote"], {})[dt.date.fromisoformat(r["date"])] = float(rate)
    return out


def first_friday_on_or_after(d: dt.date) -> dt.date:
    return d + dt.timedelta(days=(4 - d.weekday()) % 7)


def make_grid(start: dt.date, end: dt.date, step_days: int = STEP_DAYS) -> list[dt.date]:
    """Fixed weekly grid of Fridays from the first Friday >= start up to end."""
    grid = []
    cur = first_friday_on_or_after(start)
    while cur <= end:
        grid.append(cur)
        cur += dt.timedelta(days=step_days)
    return grid


def sample_at(series: Series, grid: list[dt.date],
              max_staleness_days: int = MAX_STALENESS_DAYS) -> list[float | None]:
    """For each grid date, the latest observation at or before it (if fresh)."""
    dates = sorted(series)
    out: list[float | None] = []
    for g in grid:
        i = bisect.bisect_right(dates, g) - 1
        if i >= 0 and (g - dates[i]).days <= max_staleness_days:
            out.append(series[dates[i]])
        else:
            out.append(None)
    return out


def chain_factor(old: Series, new: Series, switch: dt.date) -> float:
    """Units of `old` per unit of `new`, measured on the first common date >= switch."""
    common = sorted(d for d in set(old) & set(new) if d >= switch)
    if not common:
        raise ValueError("no overlapping dates to chain the two series")
    d = common[0]
    return old[d] / new[d]


def chain_slot(old: Series, new: Series, switch: dt.date) -> tuple[Series, float]:
    """Join `old` (before switch) and `new` (from switch) into one continuous series.

    Values after the switch are expressed in `old` units, so the series has no
    artificial jump at the handover and log-changes stay meaningful.
    """
    factor = chain_factor(old, new, switch)
    joined: Series = {d: v for d, v in old.items() if d < switch}
    joined.update({d: v * factor for d, v in new.items() if d >= switch})
    return joined, factor


def fill_interior_gaps(values: list[float | None], max_gap: int = MAX_GAP_WEEKS) -> tuple[int, list[float]]:
    """Strip leading Nones and carry forward short interior holes.

    Returns (index of first value, dense list from that index).
    """
    first = next((i for i, v in enumerate(values) if v is not None), None)
    if first is None:
        raise ValueError("series has no values")
    dense: list[float] = []
    gap = 0
    for v in values[first:]:
        if v is None:
            gap += 1
            if gap > max_gap:
                raise ValueError(f"interior gap longer than {max_gap} weeks")
            dense.append(dense[-1])
        else:
            gap = 0
            dense.append(v)
    return first, dense


def big_moves(values: list[float], limit: float = MAX_WEEKLY_LOG_MOVE) -> list[tuple[int, float]]:
    """Indices whose week-on-week |log change| exceeds `limit` (data-artefact check)."""
    return [
        (i, math.log(values[i] / values[i - 1]))
        for i in range(1, len(values))
        if abs(math.log(values[i] / values[i - 1])) > limit
    ]


def round_sig(x: float, sig: int = 6) -> float:
    if x == 0:
        return 0.0
    return round(x, sig - 1 - int(math.floor(math.log10(abs(x)))))


def latest_and_previous(series: Series) -> dict | None:
    """Latest business-day rate plus the previous business day's (different) rate.

    The composite feed also publishes weekend values, which are re-blends of
    Friday's quotes and differ only by noise, so we compare weekdays (Mon-Fri)
    only. If a holiday carried the same value over, we walk back to the last
    real change. Mirrored in functions/api/today.ts - keep them in sync.
    """
    weekdays = {d: v for d, v in series.items() if d.weekday() < 5}
    series = weekdays or series
    if not series:
        return None
    dates = sorted(series)
    last = dates[-1]
    rate = series[last]
    prev_date = None
    for d in reversed(dates[:-1]):
        if series[d] != rate:
            prev_date = d
            break
    return {
        "date": last.isoformat(),
        "rate": rate,
        "prev": series[prev_date] if prev_date else rate,
        "prevDate": (prev_date or last).isoformat(),
    }


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build_history(by_code: dict[str, Series], today: dt.date) -> dict:
    grid = make_grid(min(min(s) for s in by_code.values()), today)
    currencies = []
    for slot, members in SLOTS.items():
        segments = []
        factor = 1.0
        if len(members) == 2:
            series, factor = chain_slot(by_code[members[0]], by_code[members[1]], EURO_SWITCH)
            if abs(factor / DEM_PER_EUR_OFFICIAL - 1) > 0.005:
                raise ValueError(f"DEM/EUR chain factor {factor} far from official rate")
        else:
            series = by_code[members[0]]
        first, dense = fill_interior_gaps(sample_at(series, grid))
        moves = big_moves(dense)
        if moves:
            i, move = moves[0]
            raise ValueError(f"{slot}: suspicious weekly move {move:+.2f} at {grid[first + i]}")
        segments.append({"code": members[0], "fromIndex": first})
        if len(members) == 2:
            switch_idx = bisect.bisect_left(grid, EURO_SWITCH)
            segments.append({"code": members[1], "fromIndex": switch_idx})
        currencies.append({
            "slot": slot,
            "first": first,
            "segments": segments,
            "chainFactor": round_sig(factor, 7),
            "values": [round_sig(v) for v in dense],
        })
    return {
        "attribution": ATTRIBUTION,
        "base": BASE,
        "unit": "units of currency per 1 base unit (EUR slot in DEM-equivalents)",
        "start": grid[0].isoformat(),
        "end": grid[-1].isoformat(),
        "stepDays": STEP_DAYS,
        "count": len(grid),
        "currencies": currencies,
    }


def build_snapshot(by_code: dict[str, Series], fetched_at: dt.datetime | None = None) -> dict:
    rates = {}
    for code in TODAY_CODES:
        info = latest_and_previous(by_code.get(code, {}))
        if info:
            rates[code] = info
    as_of = max(v["date"] for v in rates.values())
    # When the data was fetched, so the app can say how old a saved copy is.
    fetched = fetched_at or dt.datetime.now(dt.timezone.utc)
    return {
        "attribution": ATTRIBUTION,
        "base": BASE,
        "asOf": as_of,
        "fetchedAt": fetched.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "bundled",
        "rates": rates,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="re-download all cached chunks")
    ap.add_argument("--offline", action="store_true", help="use cached chunks only")
    args = ap.parse_args(argv)

    today = dt.date.today()
    by_code = parse_records(fetch_daily(today, args.refresh, args.offline))
    missing = [c for c in all_codes() if c not in by_code]
    if missing:
        raise SystemExit(f"API returned no data for: {missing}")

    history = build_history(by_code, today)
    snapshot = build_snapshot(by_code)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Compact separators keep the bundle small (~0.2 MB, gzip well under 0.1 MB).
    # newline="\n" keeps LF endings on Windows too (stable git diffs).
    (OUT_DIR / "history.json").write_text(
        json.dumps(history, separators=(",", ":")), encoding="utf-8", newline="\n"
    )
    (OUT_DIR / "snapshot.json").write_text(
        json.dumps(snapshot, indent=1) + "\n", encoding="utf-8", newline="\n"
    )

    size_kb = (OUT_DIR / "history.json").stat().st_size / 1024
    print(f"history.json: {history['count']} weeks {history['start']}..{history['end']}, {size_kb:.0f} KB")
    for c in history["currencies"]:
        print(f"  {c['slot']}: from {c['first']} ({len(c['values'])} weeks)")
    print(f"snapshot.json: as of {snapshot['asOf']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
