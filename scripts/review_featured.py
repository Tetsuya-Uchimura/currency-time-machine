"""
Check the review of the featured years (content/featured-review.json) and
write docs/featured-years-review.md: for 1971, 1985, 1997, 2008 and 2022,
every statement the app makes (events, portal summaries, policies and people,
portal scenes, the guide's openings) next to the quotes and checks behind it.

  - each quote must appear in its source (content/sources.json);
  - each `history:` item's text must still be the text of content/history.json
    (the node tests check the portal scenes and the openings the same way);
  - each `rates` reference must name figures that pass scripts/check_rates.py;
  - the year's events must all be reviewed (public/data/annual-events.json).

Usage:  python scripts/review_featured.py [--refresh]
Run scripts/build_events.py first. Exit code 1 if anything fails.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_events as be  # noqa: E402
import build_media as bm  # noqa: E402
import check_rates as cr  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
REVIEW = ROOT / "content" / "featured-review.json"
HISTORY = ROOT / "content" / "history.json"
EVENTS_SRC = ROOT / "content" / "annual-events.json"
EVENTS_OUT = ROOT / "public" / "data" / "annual-events.json"
REPORT = ROOT / "docs" / "featured-years-review.md"
YEARS = {"gold-break": 1971, "dollar-adjustment": 1985, "asian-crisis": 1997, "gfc": 2008}


def history_text(history: dict, target: str) -> str | None:
    """The text a `history:<event>:<field>[:<index or person>]` target points at."""
    _, eid, field, *rest = target.split(":")
    ev = next((e for e in history["events"] if e["id"] == eid), None)
    if ev is None:
        return None
    if field == "summary":
        return ev["summary"]
    if field == "policies":
        i = int(rest[0])
        return ev["policies"][i] if i < len(ev["policies"]) else None
    if field == "people":
        p = next((p for p in ev["people"] if p["person"] == rest[0]), None)
        return p["involvement"] if p else None
    return None


def year_of(target: str) -> int:
    kind, key = target.split(":")[:2]
    return int(key) if kind == "story" else YEARS[key]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args(argv)
    bm._refresh = args.refresh
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    review = json.loads(REVIEW.read_text(encoding="utf-8"))["items"]
    sources = json.loads(be.SOURCES.read_text(encoding="utf-8"))["sources"]
    history = json.loads(HISTORY.read_text(encoding="utf-8"))
    src_events = {e["id"]: e for e in json.loads(EVENTS_SRC.read_text(encoding="utf-8"))["events"]}
    out_events = json.loads(EVENTS_OUT.read_text(encoding="utf-8"))["events"]

    keys = {i["source"] for it in review for i in it["evidence"] if "source" in i}
    texts = be.load_texts(keys, sources)
    w = cr.Weekly(json.loads(cr.HISTORY.read_text(encoding="utf-8")))
    claims = cr.claims(w, {c: cr.load_fred(c) for c in cr.SERIES})

    problems: list[str] = []
    for it in review:
        t = it["target"]
        if t.startswith("history:"):
            now = history_text(history, t)
            if now != it["text"]:
                problems.append(f"{t}: the app's text changed since the review: {now!r}")
        for i in it["evidence"]:
            if "source" in i:
                if i["source"] not in sources:
                    problems.append(f"{t}: unknown source {i['source']}")
                elif be.quote_found(texts.get(i["source"], ""), i["quote"]) < 0:
                    problems.append(f"{t}: quote not found in {i['source']}: {i['quote'][:70]}")
            elif "rates" in i:
                hits = [c for c in claims if c["claim"].startswith(i["rates"])]
                if not hits:
                    problems.append(f"{t}: no rate check named {i['rates']!r}")
                problems += [f"{t}: rate check failed: {c['claim']}" for c in hits if not c["ok"] and not c["explained"]]
    for year in sorted(set(cr.FEATURED_YEARS)):
        for e in out_events:
            if e["date"].startswith(str(year)) and e["status"] != "reviewed":
                problems.append(f"event {e['id']} ({year}) is not reviewed")
    write_report(review, sources, src_events, out_events, claims)
    if problems:
        print("\n".join(problems))
        return 1
    print(f"featured review: {len(review)} statements, {sum(len(i['evidence']) for i in review)} pieces of evidence: all found")
    return 0


def evidence_line(i: dict, sources: dict, claims: list[dict]) -> str:
    if "source" in i:
        s = sources[i["source"]]
        return f"\"{i['quote']}\" ([{s['publisher']}]({s['url']}), {'primary' if s['primary'] else 'secondary'})"
    if "rates" in i:
        hits = [c for c in claims if c["claim"].startswith(i["rates"])]
        parts = [f"{c['claim']}: {'OK' if c['ok'] else 'explained'}" for c in hits]
        return "Rates recomputed from H.10 ([rates-crosscheck.md](rates-crosscheck.md)): " + "; ".join(parts)
    return i.get("office", "")


def write_report(review, sources, src_events, out_events, claims) -> None:
    lines = [
        "# The featured years: what the app says, and why",
        "",
        f"Generated {dt.date.today().isoformat()} by `scripts/review_featured.py`. Do not edit by hand.",
        "",
        "For 1971, 1985, 1997, 2008 and 2022, every statement the app makes is listed with the evidence behind it.",
        "Quotes were chosen by a person and are checked automatically to appear in their sources; the reading of a",
        "quote (does it support the statement?) is the reviewer's judgement, recorded here for anyone to check.",
        "Primary sources are records of the bodies that acted; secondary ones (Wikipedia, Federal Reserve History",
        "essays) are marked. Leaders' terms are checked separately (docs/leaders-verification.md).",
        "",
        "Event dates and exchange-rate dates differ: rates are weekly observations (Fridays), and the app stops the",
        "year at the first observation on or after an event and names that week.",
        "",
    ]
    for year in cr.FEATURED_YEARS:
        lines += [f"## {year}", "", "### Events", ""]
        for e in [e for e in out_events if e["date"].startswith(str(year))]:
            lines += [f"- **{e['date']} {e['title']}** ({e['status']}): {e['summary']}"]
            for i in src_events[e["id"]].get("evidence", []):
                if "row" in i:
                    r = i["row"]
                    s = sources[i["source"]]
                    lines.append(f"  - {i['claim']}: data row {r['date']}, {r['amount']} (100 million yen), yen bought ([{s['publisher']}]({s['url']}), primary)")
                else:
                    lines.append(f"  - {i['claim']}: {evidence_line(i, sources, claims)}")
        items = [it for it in review if year_of(it["target"]) == year]
        if items:
            lines += ["", "### Portal, scene and guide", ""]
        for it in items:
            lines.append(f"- `{it['target']}`: {it['text']}")
            lines += [f"  - {evidence_line(i, sources, claims)}" for i in it["evidence"]]
            if it.get("note"):
                lines.append(f"  - Note: {it['note']}")
        lines.append("")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
