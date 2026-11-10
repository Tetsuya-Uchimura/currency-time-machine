"""
Cross-check the bundled exchange rates (public/data/history.json, built from
Frankfurter's composite rates) against an independent series: the Federal
Reserve's H.10 noon buying rates in New York, via FRED (St. Louis Fed).

For every featured year (1971, 1985, 1997, 2008, 2022) and every currency
with an H.10 series, each weekly observation is compared with the H.10 rate
of the same day (or the last business day before it, up to 5 days). The
figures the guide and the portals state are recomputed from H.10 too.

Writes docs/rates-crosscheck.md. Exit code 1 if a check fails.
Note: H.10 rates are taken at noon in New York; the composite blends several
sources, so small differences (a fraction of a percent) are expected.

Usage:  python scripts/check_rates.py [--refresh]
Standard library only. Downloads are cached in data-raw/ (gitignored).
"""
from __future__ import annotations

import argparse
import bisect
import csv
import datetime as dt
import io
import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_media as bm  # noqa: E402  (cached fetch with a polite User-Agent)

ROOT = Path(__file__).resolve().parent.parent
HISTORY = ROOT / "public" / "data" / "history.json"
REPORT = ROOT / "docs" / "rates-crosscheck.md"
FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={id}&cosd=1971-01-01"
FEATURED_YEARS = [1971, 1985, 1997, 2008, 2022]
MAX_DEVIATION_PCT = 1.5  # one weekly observation vs H.10
MAX_MONTHLY_DEVIATION_PCT = 2.0  # mean of a month's weekly observations vs H.10's monthly average
GROSS_PCT = 5.0  # above this a weekly difference fails unless it is explained below
MAX_GAP_DAYS = 5

# Large differences checked by hand against both daily series (data-raw cache and FRED): not a date shift, but
# rates taken at different hours of a day when the currency swung widely.
KNOWN = {
    ("KRW", "1997-12-26"): (
        "Composite 1,743 vs H.10 1,506 on 26 December 1997. The won swung by up to a fifth a day that month "
        "(H.10: 1,960 on 23 December, 1,506 on 26 December, 1,695 on 31 December; composite: 1,954, 1,743, 1,697). "
        "Both daily series agree before and after that week. The year's change the guide states for the won "
        "(first to last weekly observation, 3 January to 26 December) therefore depends on the hour: -51.6% "
        "with the composite, -43.8% with H.10."
    ),
}

# Code -> (FRED series, True if quoted as USD per unit and so inverted).
# FRED no longer serves the daily Deutsche Mark series (DEXGEUS); its monthly average (EXGEUS) is used, and the
# Mark is compared month by month: the mean of our weekly observations in a month against H.10's monthly average.
MONTHLY = {"DEM"}
SERIES = {
    "DEM": ("EXGEUS", False),
    "EUR": ("DEXUSEU", True),
    "GBP": ("DEXUSUK", True),
    "CHF": ("DEXSZUS", False),
    "CAD": ("DEXCAUS", False),
    "JPY": ("DEXJPUS", False),
    "AUD": ("DEXUSAL", True),
    "INR": ("DEXINUS", False),
    "CNY": ("DEXCHUS", False),
    "KRW": ("DEXKOUS", False),
}


# ---------------------------------------------------------------------------
# Pure helpers (unit tested in tests/test_check_rates.py)
# ---------------------------------------------------------------------------


def parse_fred(text: str, invert: bool) -> tuple[list[str], list[float]]:
    """FRED CSV -> sorted dates and units per USD (missing days skipped)."""
    dates, values = [], []
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 2 or not row[0][:4].isdigit():
            continue
        try:
            v = float(row[1])
        except ValueError:
            continue  # "." = no rate that day
        if v <= 0:
            continue
        dates.append(row[0])
        values.append(1 / v if invert else v)
    return dates, values


def rate_on(dates: list[str], values: list[float], iso: str, monthly: bool = False) -> float | None:
    """The rate of that day, else of the last business day before it (within MAX_GAP_DAYS).
    Monthly series: the average of that month."""
    if monthly:
        key = iso[:7] + "-01"
        i = bisect.bisect_left(dates, key)
        return values[i] if i < len(dates) and dates[i] == key else None
    i = bisect.bisect_right(dates, iso) - 1
    if i < 0:  # before the series' first day (H.10 starts on 4 January 1971): its first rate, if within the gap
        ok = dates and (dt.date.fromisoformat(dates[0]) - dt.date.fromisoformat(iso)).days <= MAX_GAP_DAYS
        return values[0] if ok else None
    gap = (dt.date.fromisoformat(iso) - dt.date.fromisoformat(dates[i])).days
    return values[i] if gap <= MAX_GAP_DAYS else None


def pct_change(a: float, b: float) -> float:
    """Change in a currency's value against USD when its rate per USD goes a -> b."""
    return (a / b - 1) * 100


class Weekly:
    """The bundled weekly series: rate per USD of a code on observation k."""

    def __init__(self, history: dict):
        self.start = dt.date.fromisoformat(history["start"])
        self.count = history["count"]
        self.step = history["stepDays"]
        self.slots = history["currencies"]

    def iso(self, k: int) -> str:
        return (self.start + dt.timedelta(days=self.step * k)).isoformat()

    def index_on_or_after(self, iso: str) -> int:
        days = (dt.date.fromisoformat(iso) - self.start).days
        return max(0, -(-days // self.step))

    def rate(self, code: str, k: int) -> float | None:
        for s in self.slots:
            segs = s["segments"]
            for j, seg in enumerate(segs):
                end = segs[j + 1]["fromIndex"] if j + 1 < len(segs) else self.count
                if seg["code"] == code and seg["fromIndex"] <= k < end and k >= s["first"]:
                    v = s["values"][k - s["first"]] if len(s["values"]) < self.count else s["values"][k]
                    return v / s.get("chainFactor", 1.0) if code == "EUR" else v
        return None

    def codes_in_year(self, year: int) -> list[str]:
        k0, k1 = self.index_on_or_after(f"{year}-01-01"), self.index_on_or_after(f"{year + 1}-01-01")
        return [c for c in SERIES if any(self.rate(c, k) is not None for k in range(k0, min(k1, self.count)))]


# ---------------------------------------------------------------------------


def load_fred(code: str) -> tuple[list[str], list[float]]:
    sid, invert = SERIES[code]
    raw = bm.fetch(FRED.format(id=sid), binary=True)
    return parse_fred(raw.decode("utf-8", "replace"), invert)


def compare_year(w: Weekly, fred: dict, year: int) -> list[dict]:
    rows = []
    k0, k1 = w.index_on_or_after(f"{year}-01-01"), min(w.index_on_or_after(f"{year + 1}-01-01"), w.count)
    for code in w.codes_in_year(year):
        devs = []
        worst = None
        if code in MONTHLY:  # month by month: mean of our weekly observations vs the monthly average
            months: dict[str, list[float]] = {}
            for k in range(k0, k1):
                if w.rate(code, k) is not None:
                    months.setdefault(w.iso(k)[:7], []).append(w.rate(code, k))
            pairs = [(m + "-01", statistics.mean(v), rate_on(*fred[code], m + "-01", True)) for m, v in months.items()]
        else:
            pairs = [(w.iso(k), w.rate(code, k), rate_on(*fred[code], w.iso(k))) for k in range(k0, k1)]
        for iso, ours, theirs in pairs:
            if ours is None or theirs is None:
                continue
            d = abs(ours / theirs - 1) * 100
            devs.append(d)
            if worst is None or d > worst[0]:
                worst = (d, iso, ours, theirs)
        if devs:
            rows.append({"year": year, "code": code, "n": len(devs), "median": statistics.median(devs), "worst": worst, "monthly": code in MONTHLY})
    return rows


def claims(w: Weekly, fred: dict) -> list[dict]:
    """The figures stated by the guide and the portals, recomputed from H.10 at the same weekly dates."""
    out = []

    def week(iso: str) -> int:
        return w.index_on_or_after(iso)

    def both(code: str, k: int) -> tuple[float | None, float | None]:
        return w.rate(code, k), rate_on(*fred[code], w.iso(k), code in MONTHLY)

    # 1985 opening: the Mark's and the yen's change from the first week of 1980 to the first week of 1985.
    a, b = week("1980-01-01"), week("1985-01-01")
    for code in ("DEM", "JPY"):
        (o0, f0), (o1, f1) = both(code, a), both(code, b)
        out.append({
            "claim": f"1985 opening: {code} change {w.iso(a)} to {w.iso(b)}" + (" (H.10: monthly averages)" if code in MONTHLY else ""),
            "ours": pct_change(o0, o1), "h10": pct_change(f0, f1), "unit": "%", "tol": 3.0 if code in MONTHLY else 1.0,
        })
    # 1985 portal: the dollar had peaked before September (both the Mark and the yen at their weakest earlier in the year).
    for code in ("DEM", "JPY"):
        ks = range(week("1985-01-01"), week("1986-01-01"))
        peak_ours = max(ks, key=lambda k: w.rate(code, k))
        dates, values = fred[code]
        days = [(d, v) for d, v in zip(dates, values) if d.startswith("1985")]
        peak_fred = max(days, key=lambda x: x[1])[0]
        out.append({
            "claim": f"1985 portal: USD peak against {code} before the Plaza meeting (22 September)",
            "ours": w.iso(peak_ours), "h10": peak_fred, "unit": "date",
            "ok": w.iso(peak_ours) < "1985-09-22" and peak_fred < "1985-09-22",
        })
    def stated_rate(claim: str, code: str, iso: str, stated: float, tol: float, h10_iso: str | None = None) -> None:
        k = week(iso)
        o = w.rate(code, k)
        f = rate_on(*fred[code], h10_iso or w.iso(k), code in MONTHLY)
        out.append({"claim": claim, "ours": o, "h10": f, "unit": code, "stated": stated, "tol": tol, "weeks": [(code, w.iso(k))]})

    def change(claim: str, code: str, iso0: str, iso1: str, stated: float | None, tol: float) -> None:
        a, b = week(iso0), week(iso1)
        (o0, f0), (o1, f1) = both(code, a), both(code, b)
        h10 = pct_change(f0, f1) if None not in (f0, f1) else None
        c = {"claim": claim, "ours": pct_change(o0, o1), "h10": h10, "unit": "%", "tol": tol, "weeks": [(code, w.iso(a)), (code, w.iso(b))]}
        if stated is not None:
            c["stated"] = stated
        out.append(c)

    def direction(claim: str, code: str, iso0: str, iso1: str, stronger: bool) -> None:
        a, b = week(iso0), week(iso1)
        (o0, f0), (o1, f1) = both(code, a), both(code, b)
        ok = None not in (o0, o1, f0, f1) and ((o1 < o0) == stronger) and ((f1 < f0) == stronger)
        out.append({"claim": claim, "ours": f"{o0:,.4g} -> {o1:,.4g}", "h10": f"{f0:,.4g} -> {f1:,.4g}", "unit": "text", "ok": ok, "weeks": [(code, w.iso(a)), (code, w.iso(b))]})

    # Portal scene 1971: the yen from about 357 (August 1971) to about 280 (end of 1973).
    stated_rate("portal scene 1971: JPY about 357 per USD (August 1971)", "JPY", "1971-08-13", 357, 1.5)
    stated_rate("portal scene 1971: JPY about 280 per USD (end of 1973)", "JPY", "1973-12-28", 280, 2.0)
    # Portal scene 1985: the yen 242 -> 127 and the Mark 2.9 -> 1.6 over the next two years (to the end of 1987).
    stated_rate("portal scene 1985: JPY about 242 per USD (September 1985)", "JPY", "1985-09-20", 242, 1.5)
    stated_rate("portal scene 1985: JPY about 127 per USD (end of 1987)", "JPY", "1987-12-25", 127, 2.0)
    stated_rate("portal scene 1985: DEM about 2.9 per USD (September 1985; H.10 monthly average)", "DEM", "1985-09-20", 2.9, 3.0)
    stated_rate("portal scene 1985: DEM about 1.6 per USD (end of 1987; H.10 monthly average)", "DEM", "1987-12-25", 1.6, 3.0)
    # 1997 portal and scene: the won from about 888 (late June) to about 1,700 (end of December), partly back in 1998.
    stated_rate("1997 portal: KRW about 888 per USD (late June 1997)", "KRW", "1997-06-27", 888, 3.0)
    stated_rate(
        "1997 portal: KRW about 1,700 per USD at the end of 1997 (app: last week, 26 Dec; H.10: 31 Dec)",
        "KRW", "1997-12-26", 1700, 3.0, h10_iso="1997-12-31",
    )
    direction("portal scene 1997: KRW recovered part of the loss in 1998 (end of 1997 to end of 1998)", "KRW", "1997-12-26", "1998-12-25", True)
    # 2008 portal and scene: the won 1,040 -> 1,470, the Australian dollar lost about a third, the yen rose.
    stated_rate("2008 portal: KRW about 1,040 per USD (late June 2008)", "KRW", "2008-06-27", 1040, 3.0)
    stated_rate("2008 portal: KRW about 1,470 per USD (late November 2008)", "KRW", "2008-11-28", 1470, 3.0)
    change("2008 portal: AUD lost about a third against USD (late June to late November)", "AUD", "2008-06-27", "2008-11-28", -33.3, 4.0)
    change("portal scene 2008: AUD lost about a third against USD (mid-July to late October)", "AUD", "2008-07-18", "2008-10-24", -33.3, 5.0)
    direction("portal scene 2008: the yen rose against USD (late June to late November)", "JPY", "2008-06-27", "2008-11-28", True)
    # Year results the guide states (first to last weekly observation of the year), for the featured years.
    for year in FEATURED_YEARS:
        k0, k1 = week(f"{year}-01-01"), week(f"{year + 1}-01-01") - 1
        for code in w.codes_in_year(year):
            if w.rate(code, k0) is None or w.rate(code, k1) is None:
                continue
            monthly = code in MONTHLY
            label = f"{year} year: {code} {w.iso(k0)} to {w.iso(k1)}" + (" (H.10: monthly averages)" if monthly else "")
            change(label, code, w.iso(k0), w.iso(k1), None, 4.0 if monthly else 2.0)
    for c in out:
        if "ok" not in c:
            if None in (c["ours"], c["h10"]):
                c["ok"] = False
            elif c["unit"] == "%":
                c["ok"] = abs(c["ours"] - c["h10"]) <= c["tol"] and ("stated" not in c or abs(c["ours"] - c["stated"]) <= c["tol"])
            else:
                c["ok"] = all(abs(x / c["stated"] - 1) * 100 <= c["tol"] for x in (c["ours"], c["h10"]))
        c["explained"] = None if c["ok"] else next((KNOWN[x] for x in c.get("weeks", []) if x in KNOWN), None)
    return out


def limit(row: dict) -> float:
    """Allowed difference: a weekly observation vs H.10's day; a monthly mean of weeks vs H.10's monthly average."""
    return MAX_MONTHLY_DEVIATION_PCT if row["monthly"] else MAX_DEVIATION_PCT


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args(argv)
    bm._refresh = args.refresh
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    w = Weekly(json.loads(HISTORY.read_text(encoding="utf-8")))
    fred = {c: load_fred(c) for c in SERIES}
    rows = [r for y in FEATURED_YEARS for r in compare_year(w, fred, y)]
    cs = claims(w, fred)
    def status(r: dict) -> str:
        d, iso = r["worst"][0], r["worst"][1]
        if d <= limit(r):
            return "OK"
        if (r["code"], iso) in KNOWN:
            return "explained"
        return "differs" if d <= GROSS_PCT else "FAIL"

    for r in rows:
        r["status"] = status(r)
    bad_rows = [r for r in rows if r["status"] == "FAIL"]
    bad_claims = [c for c in cs if not c["ok"] and not c["explained"]]

    def fmt(x, unit):
        if isinstance(x, str) or x is None:
            return str(x)
        return f"{x:+.1f}%" if unit == "%" else f"{x:,.4g}"

    lines = [
        "# Exchange rates: cross-check against the Federal Reserve's H.10",
        "",
        f"Generated {dt.date.today().isoformat()} by `scripts/check_rates.py`. Do not edit by hand.",
        "",
        "The app's rates are Frankfurter's composite rates sampled weekly (Fridays). Here each weekly observation",
        "of the featured years is compared with the Federal Reserve's H.10 noon buying rate in New York for the same",
        f"day (FRED series DEX...; the last business day before it when that day has no rate). A week fails above",
        f"{MAX_DEVIATION_PCT}%. FRED no longer serves H.10's daily Deutsche Mark rates, so the Mark (to 1998) is compared",
        f"month by month (our weekly mean vs H.10's monthly average, limit {MAX_MONTHLY_DEVIATION_PCT}%). The figures the guide and",
        "the portals state are then recomputed from H.10.",
        "",
        f"- **OK**: within the limit. **differs**: above it but under {GROSS_PCT}%. Most of these are weeks of fast moves",
        "  (October 2008, the September and October 2022 interventions), when rates taken at different hours can differ by",
        "  a few percent; they were not checked one by one.",
        f"  **explained**: above {GROSS_PCT}%, checked by hand against both daily series (see the end). **FAIL**: anything else.",
        "- The app shows the weekly composite. A difference here does not make a stated figure wrong, but it shows how",
        "  much a figure taken on one day can depend on the hour, in the most volatile weeks.",
        "",
        "## Weekly observations",
        "",
        "| Year | Currency | Weeks | Median difference | Largest difference | Result |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        d, iso, o, f = r["worst"]
        n = f"{r['n']} months (monthly averages)" if r["monthly"] else str(r["n"])
        st = r["status"] if r["status"] == "OK" else f"**{r['status']}**"
        lines.append(f"| {r['year']} | {r['code']} | {n} | {r['median']:.2f}% | {d:.2f}% ({iso}: {o:,.4g} vs {f:,.4g}) | {st} |")
    lines += ["", "## Figures stated in the app", "", "| Claim | App data | H.10 | Result |", "| --- | --- | --- | --- |"]
    for c in cs:
        res = "OK" if c["ok"] else ("**explained** (see below)" if c["explained"] else "**FAIL**")
        lines.append(f"| {c['claim']} | {fmt(c['ours'], c['unit'])} | {fmt(c['h10'], c['unit'])} | {res} |")
    lines += ["", "## Explained differences", ""]
    lines += [f"- {code} {iso}: {why}" for (code, iso), why in KNOWN.items()]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    n_ok = sum(1 for c in cs if c["ok"])
    n_exp = sum(1 for c in cs if c["explained"])
    counts = {s: sum(r["status"] == s for r in rows) for s in ("OK", "differs", "explained", "FAIL")}
    print(f"series-years: {len(rows)} {counts}; claims: {n_ok} OK, {n_exp} explained, {len(bad_claims)} failed")
    for r in bad_rows:
        print("  week", r["year"], r["code"], f"{r['worst'][0]:.2f}%", r["worst"][1])
    for c in bad_claims:
        print("  claim", c["claim"], c["ours"], c["h10"])
    return 1 if bad_rows or bad_claims else 0


if __name__ == "__main__":
    raise SystemExit(main())
