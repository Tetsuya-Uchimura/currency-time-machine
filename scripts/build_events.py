"""
Verify the Year Journey's events (content/annual-events.json) against their
sources and write the ones that pass to public/data/annual-events.json.

Two levels, and the app says which one an event reached:

  reviewed  The event carries `evidence`: quotes we chose from named sources
            (content/sources.json), mostly primary ones (the body that acted:
            a ministry, a central bank, the IMF, a government record). Every
            quote must appear in its source's text, and one quote marked
            `date: true` must itself give the event's day and month (the year
            in the quote or close to it). A `mof-feio` item is a row of the
            Ministry of Finance Japan's intervention data: that date, that
            amount, yen bought. The claims each quote supports are listed in
            docs/events-verification.md for a human to read.

  matched   No evidence: an automatic check of the event's Wikipedia
            `sources`. One passage (a sentence and the next one) must contain
            the date and every keyword. A page that has the date in one place
            and the keyword in another no longer passes.

Events in the featured years must be reviewed, or the build fails. Events
that pass neither check are left out and listed in the report.

Usage:  python scripts/build_events.py [--refresh]
Standard library; reading a PDF source needs pypdf (pip install pypdf).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import io
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_media as bm  # noqa: E402  (cached fetch with a polite User-Agent)

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "annual-events.json"
SOURCES = ROOT / "content" / "sources.json"
OUT = ROOT / "public" / "data" / "annual-events.json"
REPORT = ROOT / "docs" / "events-verification.md"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
REGIONS = {"USA", "CAN", "GBR", "DEU", "EA", "CHE", "IND", "CHN", "KOR", "JPN", "AUS"}
CURRENCIES = {"USD", "CAD", "GBP", "EUR", "CHF", "INR", "CNY", "KRW", "JPY", "AUD"}
FEATURED_YEARS = {1971, 1985, 1997, 2008, 2022}
YEAR_NEAR = 1500  # characters around a quote in which its year may appear instead


# ---------------------------------------------------------------------------
# Pure helpers (unit tested in tests/test_year_journey_scripts.py)
# ---------------------------------------------------------------------------


def normalize(text: str) -> str:
    """Lower case, punctuation to spaces, '22nd' -> '22', one space between words."""
    text = text.replace(" ", " ").replace(" ", " ")
    text = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", text, flags=re.I)
    text = re.sub(r"[^0-9a-z]+", " ", text.lower())
    return f" {text.strip()} "


def squash(text: str) -> str:
    """Letters and digits only: robust to the stray spaces of PDF text extraction."""
    return re.sub(r"[^0-9a-z]+", "", text.lower())


def date_variants(iso: str, precision: str = "day", with_year: bool = True) -> list[str]:
    """How a source may write the date (normalized). `precision` month/year: the
    sources only give the month or the year, and the app shows no more than that."""
    d = dt.date.fromisoformat(iso)
    m = MONTHS[d.month - 1]
    if precision == "year":
        out = [str(d.year)]
    elif precision == "month":
        out = [f"{m} {d.year}"]
    elif with_year:
        out = [f"{d.day} {m} {d.year}", f"{m} {d.day} {d.year}", f"{m} {d.day:02d} {d.year}", iso, f"{d.day:02d} {m} {d.year}"]
    else:
        out = [f"{d.day} {m}", f"{m} {d.day}", f"{m} {d.day:02d}", f"{d.day:02d} {m}"]
    return [normalize(v) for v in out]


def has_date(text: str, iso: str, precision: str = "day") -> bool:
    t = normalize(text)
    return any(v in t for v in date_variants(iso, precision))


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])|\n+", text)
    return [p for p in (s.strip() for s in parts) if p]


def matching_passage(text: str, date: str, keys: list[str], precision: str = "day") -> str | None:
    """The shortest passage with the date and every keyword: one sentence, else a sentence and the next one."""
    ss = sentences(text)
    variants = date_variants(date, precision)

    def ok(passage: str) -> bool:
        t = normalize(passage)
        return any(v in t for v in variants) and all(normalize(k).strip() in t for k in keys)

    for size in (1, 2):
        for i in range(len(ss)):
            window = " ".join(ss[i : i + size])
            if ok(window):
                return window
    return None


def passes(text: str, date: str, keys: list[str], precision: str = "day") -> bool:
    return matching_passage(text, date, keys, precision) is not None


def quote_found(text: str, quote: str) -> int:
    """Position of the quote in the squashed text, or -1."""
    return squash(text).find(squash(quote))


def quote_dates(text: str, quote: str, iso: str) -> bool:
    """The quote gives the day and month; the year is in the quote or close to it in the source."""
    d = dt.date.fromisoformat(iso)
    q = normalize(quote)
    if any(v in q for v in date_variants(iso)):
        return True
    if not any(v in q for v in date_variants(iso, with_year=False)):
        return False
    pos = quote_found(text, quote)
    if pos < 0:
        return False
    s = squash(text)
    return str(d.year) in s[max(0, pos - YEAR_NEAR) : pos + len(squash(quote)) + YEAR_NEAR]


def feio_rows(csv_text: str) -> list[dict]:
    """The Ministry of Finance's intervention CSV -> [{date, amount, bought}] (amounts in 100 million yen)."""
    out, year, month = [], None, None
    for r in csv.reader(io.StringIO(csv_text)):
        if len(r) < 9 or not r[5].strip().isdigit() or not r[6].strip():
            continue
        if r[3].strip().isdigit():
            year = int(r[3])
        if r[4].strip():
            month = MONTHS.index(next(m for m in MONTHS if m.startswith(r[4].strip()[:3]))) + 1
        if year is None or month is None:
            continue
        out.append({"date": dt.date(year, month, int(r[5])).isoformat(), "amount": r[6].strip(), "bought": r[8].strip()})
    return out


def feio_check(rows: list[dict], item: dict) -> str | None:
    """None if the row is in the data (and `previous` is the purchase of yen before it); else the reason."""
    want = item["row"]
    hit = [r for r in rows if r["date"] == want["date"]]
    if not hit:
        return f"no intervention on {want['date']}"
    if hit[0]["amount"] != want["amount"]:
        return f"amount on {want['date']} is {hit[0]['amount']}, not {want['amount']}"
    if "yen (bought)" not in hit[0]["bought"]:
        return f"{want['date']}: yen not bought ({hit[0]['bought']})"
    if "previous" in item:
        before = [r["date"] for r in rows if r["date"] < want["date"] and "yen (bought)" in r["bought"]]
        if not before or before[-1] != item["previous"]:
            return f"the purchase of yen before {want['date']} is {before[-1] if before else 'none'}, not {item['previous']}"
    return None


def review(event: dict, texts: dict[str, str], rows: list[dict]) -> list[str]:
    """Problems with an event's evidence (empty = reviewed)."""
    problems = []
    dated = False
    for item in event.get("evidence", []):
        src = item["source"]
        if "row" in item:
            why = feio_check(rows, item)
            if why:
                problems.append(f"{src}: {why}")
            elif item.get("date") and item["row"]["date"] == event["date"]:
                dated = True
            continue
        text = texts.get(src, "")
        if not text:
            problems.append(f"{src}: source text unavailable")
            continue
        if quote_found(text, item["quote"]) < 0:
            problems.append(f"{src}: quote not found: {item['quote'][:80]}")
            continue
        if item.get("date"):
            if quote_dates(text, item["quote"], event["date"]):
                dated = True
            else:
                problems.append(f"{src}: the date quote does not give {event['date']}")
    if not dated:
        problems.append("no quote gives the event's date")
    return problems


def check(events: list[dict], sources: dict) -> list[str]:
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
        if not e.get("sources") and not e.get("evidence"):
            errors.append(f"{e['id']}: no sources")
        for item in e.get("evidence", []):
            if item["source"] not in sources:
                errors.append(f"{e['id']}: unknown source {item['source']}")
        if int(e["date"][:4]) in FEATURED_YEARS and not e.get("evidence"):
            errors.append(f"{e['id']}: featured year {e['date'][:4]} needs evidence")
        if e.get("precision", "day") != "day" and e.get("evidence"):
            errors.append(f"{e['id']}: a reviewed event has a day")
    return errors


# ---------------------------------------------------------------------------
# Fetching source texts
# ---------------------------------------------------------------------------


def html_text(raw: bytes) -> str:
    t = raw.decode("utf-8", "replace")
    t = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", t)
    t = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</h\d>|</tr>", "\n", t)
    return html.unescape(re.sub(r"<[^>]+>", " ", t))


def pdf_text(raw: bytes) -> str:
    try:
        import pypdf  # noqa: PLC0415  (only needed for PDF sources)
    except ImportError as err:
        raise RuntimeError("PDF source: pip install pypdf") from err
    return "\n".join(p.extract_text() or "" for p in pypdf.PdfReader(io.BytesIO(raw)).pages)


def wikipedia_text(url: str) -> str:
    m = re.match(r"https://en\.wikipedia\.org/wiki/(.+)$", url)
    if not m:
        raise ValueError(f"unsupported source: {url}")
    title = urllib.parse.unquote(m.group(1)).replace("_", " ")
    d = bm.api(bm.WIKIPEDIA, action="query", prop="extracts", explaintext=1, titles=title, redirects=1, formatversion=2)
    page = d["query"]["pages"][0]
    return page.get("extract", "") if not page.get("missing") else ""


page_text = wikipedia_text  # (older name)


def source_text(src: dict) -> str:
    kind = src["kind"]
    if kind == "wikipedia":
        return wikipedia_text(src["url"])
    raw = bm.fetch(src["url"], binary=True)
    if kind == "pdf":
        return pdf_text(raw)
    if kind == "mof-feio":
        return raw.decode("cp932", "replace")
    return html_text(raw)


def load_texts(keys: set[str], sources: dict) -> dict[str, str]:
    out = {}
    for k in sorted(keys):
        try:
            out[k] = source_text(sources[k])
        except Exception as err:  # a source that cannot be read fails its quotes
            print(f"{k}: {err}")
            out[k] = ""
    return out


def source_entry(src: dict) -> dict:
    return {"publisher": src["publisher"], "title": src["title"], "url": src["url"], "primary": bool(src["primary"])}


def wikipedia_entry(url: str) -> dict:
    return {"publisher": "Wikipedia", "title": urllib.parse.unquote(url.rsplit("/", 1)[1]).replace("_", " "), "url": url, "primary": False}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args(argv)
    bm._refresh = args.refresh
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    events = json.loads(SRC.read_text(encoding="utf-8"))["events"]
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))["sources"]
    errors = check(events, sources)
    if errors:
        print("\n".join(errors))
        return 1
    texts = load_texts({i["source"] for e in events for i in e.get("evidence", [])}, sources)
    rows = feio_rows(texts.get("mof-feio", "")) if "mof-feio" in texts else []
    kept, dropped, failed, notes = [], [], [], {}
    for e in sorted(events, key=lambda e: e["date"]):
        out = {k: v for k, v in e.items() if k not in ("sources", "keys", "evidence")}
        if e.get("evidence"):
            problems = review(e, texts, rows)
            if problems:
                failed.append((e, problems))
                continue
            keys = list(dict.fromkeys(i["source"] for i in e["evidence"]))
            out["status"] = "reviewed"
            out["sources"] = [source_entry(sources[k]) for k in keys]
            kept.append(out)
            continue
        passages = []
        for url in e["sources"]:
            try:
                p = matching_passage(wikipedia_text(url), e["date"], e["keys"], e.get("precision", "day"))
                if p:
                    passages.append((url, p))
            except Exception as err:  # network or a missing page: that source fails
                print(f"{e['id']}: {url}: {err}")
        if passages:
            out["status"] = "matched"
            out["sources"] = [wikipedia_entry(u) for u, _ in passages]
            notes[e["id"]] = passages
            kept.append(out)
        else:
            dropped.append(e)
    if failed:
        for e, problems in failed:
            print(f"FAILED {e['id']}:", *problems, sep="\n  ")
        return 1
    OUT.write_text(json.dumps({"checked": dt.date.today().isoformat(), "events": kept}, ensure_ascii=False, indent=1), encoding="utf-8")
    write_report(events, kept, dropped, notes, sources)
    n_rev = sum(1 for e in kept if e["status"] == "reviewed")
    print(f"kept={len(kept)} reviewed={n_rev} matched={len(kept) - n_rev} dropped={len(dropped)}")
    for e in dropped:
        print("  dropped", e["date"], e["id"])
    return 0


def write_report(events: list[dict], kept: list[dict], dropped: list[dict], notes: dict, sources: dict) -> None:
    by_id = {e["id"]: e for e in events}
    reviewed = [e for e in kept if e["status"] == "reviewed"]
    matched = [e for e in kept if e["status"] == "matched"]
    lines = [
        "# Year Journey events: verification report",
        "",
        f"Generated {dt.date.today().isoformat()} by `scripts/build_events.py`. Do not edit by hand.",
        "",
        "- **Reviewed** events carry quotes we chose from named sources, mostly primary ones. The script checks that",
        "  every quote is in its source and that one quote gives the event's date; the claim each quote supports is",
        "  written next to it, for a person to judge. Required for the featured years (1971, 1985, 1997, 2008, 2022).",
        "- **Matched** events were only checked automatically: one passage of a Wikipedia article (a sentence and the",
        "  next one) contains the date and the keywords. This is weaker than a review and the app says so.",
        "- **Event dates and exchange rates are different things.** The rates are weekly observations (Fridays). The",
        "  app stops the year at the first observation on or after an event's date and says which week it shows.",
        "",
        f"## Reviewed ({len(reviewed)})",
        "",
    ]
    for e in reviewed:
        src = by_id[e["id"]]
        lines += [f"### {e['date']} {e['title']}", "", f"> {e['summary']}", ""]
        for item in src["evidence"]:
            s = sources[item["source"]]
            mark = "primary" if s["primary"] else "secondary"
            tag = " (gives the date)" if item.get("date") else ""
            if "row" in item:
                r = item["row"]
                body = f"data row {r['date']}: {r['amount']} (100 million yen), yen bought" + (f"; previous purchase of yen: {item['previous']}" if "previous" in item else "")
            else:
                body = f"\"{item['quote']}\""
            lines.append(f"- {item['claim']}{tag}: {body}. [{s['publisher']}, {s['title']}]({s['url']}) ({mark})")
        lines.append("")
    lines += [f"## Matched automatically ({len(matched)})", ""]
    for e in matched:
        for url, passage in notes[e["id"]]:
            short = passage if len(passage) <= 600 else "..." + passage[-597:]
            lines.append(f"- {e['date']} {e['title']}: [{wikipedia_entry(url)['title']}]({url}): \"{short}\"")
    lines += ["", f"## Left out: no passage with the date and keywords ({len(dropped)})", ""]
    lines += [f"- {e['date']} {e['title']} (keywords: {', '.join(e['keys'])})" for e in dropped]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
