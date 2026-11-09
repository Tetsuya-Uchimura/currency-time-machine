"""
Verify the Year Journey's events (content/annual-events.json) against their
sources and write the ones that pass to public/data/annual-events.json.

An event passes when at least one of its source pages contains both:
  - the event's date, in any common English form (22 September 1985,
    September 22, 1985, 1985-09-22), and
  - every one of its keywords (case-insensitive).
Only the sources that passed are kept with the event. Events that pass no
source are left out of the app and listed in docs/events-verification.md.

Sources are English Wikipedia articles (plain text via the TextExtracts API).

Usage:  python scripts/build_events.py [--refresh]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_media as bm  # noqa: E402  (cached fetch with a polite User-Agent)

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "annual-events.json"
OUT = ROOT / "public" / "data" / "annual-events.json"
REPORT = ROOT / "docs" / "events-verification.md"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
REGIONS = {"USA", "CAN", "GBR", "DEU", "EA", "CHE", "IND", "CHN", "KOR", "JPN", "AUS"}
CURRENCIES = {"USD", "CAD", "GBP", "EUR", "CHF", "INR", "CNY", "KRW", "JPY", "AUD"}


def date_variants(iso: str, precision: str = "day") -> list[str]:
    """How a source may write the date. `precision` month/year: the sources only
    give the month or the year, and the app shows no more than that."""
    d = dt.date.fromisoformat(iso)
    m = MONTHS[d.month - 1]
    if precision == "year":
        return [str(d.year)]
    if precision == "month":
        return [f"{m} {d.year}"]
    return [f"{d.day} {m} {d.year}", f"{m} {d.day}, {d.year}", f"{m} {d.day} {d.year}", iso]


def normalize(text: str) -> str:
    text = text.replace(" ", " ").replace(" ", " ")
    text = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", text)
    return re.sub(r"\s+", " ", text).lower()


def passes(text: str, date: str, keys: list[str], precision: str = "day") -> bool:
    t = normalize(text)
    return any(normalize(v) in t for v in date_variants(date, precision)) and all(normalize(k) in t for k in keys)


def page_text(url: str) -> str:
    m = re.match(r"https://en\.wikipedia\.org/wiki/(.+)$", url)
    if not m:
        raise ValueError(f"unsupported source: {url}")
    title = urllib.parse.unquote(m.group(1)).replace("_", " ")
    d = bm.api(bm.WIKIPEDIA, action="query", prop="extracts", explaintext=1, titles=title, redirects=1, formatversion=2)
    page = d["query"]["pages"][0]
    return page.get("extract", "") if not page.get("missing") else ""


def check(events: list[dict]) -> list[str]:
    """Structural problems (empty list = fine)."""
    errors = []
    ids = set()
    for e in events:
        if e["id"] in ids:
            errors.append(f"duplicate id {e['id']}")
        ids.add(e["id"])
        dt.date.fromisoformat(e["date"])
        if not set(e["regions"]) <= REGIONS:
            errors.append(f"{e['id']}: unknown region {set(e['regions']) - REGIONS}")
        if not set(e["currencies"]) <= CURRENCIES:
            errors.append(f"{e['id']}: unknown currency {set(e['currencies']) - CURRENCIES}")
        if not e["sources"]:
            errors.append(f"{e['id']}: no sources")
    return errors


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args(argv)
    bm._refresh = args.refresh
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    events = json.loads(SRC.read_text(encoding="utf-8"))["events"]
    errors = check(events)
    if errors:
        print("\n".join(errors))
        return 1
    kept, dropped = [], []
    for e in sorted(events, key=lambda e: e["date"]):
        ok = []
        for url in e["sources"]:
            try:
                if passes(page_text(url), e["date"], e["keys"], e.get("precision", "day")):
                    ok.append(url)
            except Exception as err:  # network or a missing page: that source fails
                print(f"{e['id']}: {url}: {err}")
        if ok:
            out = {k: v for k, v in e.items() if k not in ("sources", "keys")}
            out["sources"] = [{"title": urllib.parse.unquote(u.rsplit("/", 1)[1]).replace("_", " "), "url": u} for u in ok]
            kept.append(out)
        else:
            dropped.append(e)
    OUT.write_text(json.dumps({"checked": dt.date.today().isoformat(), "events": kept}, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = [
        "# Year Journey events: verification report",
        "",
        f"Checked {dt.date.today().isoformat()} by `scripts/build_events.py`. An event is shown only if one of its",
        "sources contains its date and every keyword. Source: English Wikipedia (plain text of the article).",
        "",
        f"## Shown ({len(kept)})",
        "",
    ]
    lines += [f"- {e['date']} {e['title']}: " + ", ".join(f"[{s['title']}]({s['url']})" for s in e["sources"]) for e in kept]
    lines += ["", f"## Left out: not found in the sources ({len(dropped)})", ""]
    lines += [f"- {e['date']} {e['title']} (keywords: {', '.join(e['keys'])})" for e in dropped]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"kept={len(kept)} dropped={len(dropped)}")
    for e in dropped:
        print("  dropped", e["date"], e["id"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
