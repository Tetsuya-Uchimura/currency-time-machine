"""
Build the leaders of every year (1948 to today) for the Year Journey.

For each office below (heads of government or state, party leaders where
they lead, central bank governors), ask Wikidata for every human who held it
(P39 "position held", with P580 start / P582 end qualifiers). Keep terms that
overlap 1948..today, merge duplicate statements, and report any period with
no recorded holder (shown in the app as "no verified record").

Portraits: the person's Wikidata image (P18), only if its license on
Wikimedia Commons is accepted (same rule as scripts/build_media.py), saved
as a small local WebP with its credit. Rotating or collective offices (the
Swiss presidency) get no portraits.

Outputs (committed; the app never calls these services at runtime):
  public/data/leaders.json        offices and terms (verified facts only)
  public/media/leaders/<qid>.webp portraits
  docs/leaders-verification.md    every term with its Wikidata id, and gaps

Usage:  python scripts/build_leaders.py [--refresh] [--no-portraits]
Standard library + Pillow; requests are cached in data-raw/media/.
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
import build_media as bm  # noqa: E402  (fetch cache, Commons license check, portrait saver)

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "public" / "data" / "leaders.json"
OUT_DIR = ROOT / "public" / "media" / "leaders"
EXTRA = ROOT / "content" / "leaders-extra.json"
REPORT = ROOT / "docs" / "leaders-verification.md"
SPARQL = "https://query.wikidata.org/sparql"
FROM = dt.date(1948, 1, 1)
PORTRAIT_PX = 160
GAP_DAYS = 45

# region: map/annual region id (src/data/annual-history.ts)
#   kind: head (head of government, or of state and government), party, cb (central bank)
#   since/until: only statements starting in this window (one Wikidata item can
#   name different roles over time, e.g. the CCP general secretary before 1966)
OFFICES = [
    {"id": "us-president", "role": r"^(\d+\w* )?president of the united states", "region": "USA", "qid": "Q11696", "title": "President of the United States", "kind": "head"},
    {"id": "us-fed", "role": r"federal reserve", "region": "USA", "qid": "Q2666591", "title": "Chair of the Federal Reserve", "kind": "cb"},
    {"id": "ca-pm", "role": r"prime minister of canada", "region": "CAN", "qid": "Q839078", "title": "Prime Minister of Canada", "kind": "head"},
    {"id": "ca-boc", "role": r"bank of canada", "region": "CAN", "qid": "Q26186076", "title": "Governor of the Bank of Canada", "kind": "cb"},
    {"id": "uk-pm", "role": r"prime minister of the united kingdom", "region": "GBR", "qid": "Q14211", "title": "Prime Minister of the United Kingdom", "kind": "head"},
    {"id": "uk-boe", "role": r"bank of england", "region": "GBR", "qid": "Q2579905", "title": "Governor of the Bank of England", "kind": "cb"},
    {"id": "de-chancellor", "role": r"chancellor of (west )?germany|federal chancellor", "region": "DEU", "qid": "Q4970706", "title": "Chancellor of Germany", "kind": "head"},
    {"id": "de-bundesbank", "role": r"bundesbank", "region": "DEU", "qid": "Q65621680", "title": "President of the Bundesbank", "kind": "cb"},
    {"id": "ea-ecb", "role": r"european central bank", "region": "EA", "qid": "Q605440", "title": "President of the European Central Bank", "kind": "cb"},
    {"id": "ch-president", "role": r"president of the swiss confederation", "region": "CHE", "qid": "Q688230", "title": "President of the Swiss Confederation", "kind": "head", "portraits": False},
    {"id": "ch-snb", "role": r"swiss national bank", "region": "CHE", "qid": "Q109728459", "title": "Chair of the Swiss National Bank", "kind": "cb"},
    {"id": "in-pm", "role": r"prime minister of india", "region": "IND", "qid": "Q192711", "title": "Prime Minister of India", "kind": "head"},
    {"id": "in-rbi", "role": r"reserve bank of india", "region": "IND", "qid": "Q14536141", "title": "Governor of the Reserve Bank of India", "kind": "cb"},
    {"id": "cn-chairman", "role": r"chairman of the (chinese )?communist party|chairman of the central committee", "region": "CHN", "qid": "Q2708520", "title": "Chairman of the Chinese Communist Party", "kind": "party"},
    {"id": "cn-gensec", "role": r"general secretary of the (chinese )?communist party", "region": "CHN", "qid": "Q849418", "title": "General Secretary of the Chinese Communist Party", "kind": "party", "since": "1980-01-01"},
    {"id": "cn-premier", "role": r"premier", "region": "CHN", "qid": "Q4122271", "title": "Premier of China", "kind": "head"},
    {"id": "cn-pboc", "role": r"people's bank of china", "region": "CHN", "qid": "Q20787785", "title": "Governor of the People's Bank of China", "kind": "cb"},
    {"id": "kr-president", "role": r"president of (south )?korea", "region": "KOR", "qid": "Q6296418", "title": "President of South Korea", "kind": "head"},
    {"id": "kr-bok", "role": r"bank of korea", "region": "KOR", "qid": "Q16168631", "title": "Governor of the Bank of Korea", "kind": "cb"},
    {"id": "jp-pm", "role": r"prime minister of japan", "region": "JPN", "qid": "Q274948", "title": "Prime Minister of Japan", "kind": "head"},
    {"id": "jp-boj", "role": r"bank of japan", "region": "JPN", "qid": "Q48269093", "title": "Governor of the Bank of Japan", "kind": "cb"},
    {"id": "au-pm", "role": r"prime minister of australia", "region": "AUS", "qid": "Q319145", "title": "Prime Minister of Australia", "kind": "head"},
    {"id": "au-rba", "role": r"reserve bank of australia", "region": "AUS", "qid": "Q109453640", "title": "Governor of the Reserve Bank of Australia", "kind": "cb"},
]

QUERY = """SELECT ?p ?s ?e ?img WHERE {
  ?p p:P39 ?st. ?st ps:P39 wd:%s. ?p wdt:P31 wd:Q5.
  OPTIONAL { ?st pq:P580 ?s } OPTIONAL { ?st pq:P582 ?e } OPTIONAL { ?p wdt:P18 ?img }
}"""


def sparql(q: str) -> list[dict]:
    url = SPARQL + "?" + urllib.parse.urlencode({"query": q, "format": "json"})
    return bm.fetch(url)["results"]["bindings"]


def day(v: str | None) -> dt.date | None:
    if not v:
        return None
    try:
        return dt.date.fromisoformat(v[:10])
    except ValueError:
        return None


def terms_of(office: dict, today: dt.date) -> list[dict]:
    rows = sparql(QUERY % office["qid"])
    since = dt.date.fromisoformat(office.get("since", "1900-01-01"))
    by_key: dict[tuple, dict] = {}
    for r in rows:
        qid = r["p"]["value"].rsplit("/", 1)[1]
        s, e = day(r.get("s", {}).get("value")), day(r.get("e", {}).get("value"))
        if s is None or s > today or s < since:
            continue
        if e is not None and e < FROM:
            continue
        img = r.get("img", {}).get("value")
        key = (qid, s)
        cur = by_key.get(key)
        # Several end dates for one statement: keep the latest (open beats any).
        if cur is None or (cur["end"] is not None and (e is None or e > cur["end"])):
            by_key[key] = {"qid": qid, "start": s, "end": e, "image": img}
    terms = sorted(by_key.values(), key=lambda t: (t["start"], t["qid"]))
    # Merge back-to-back statements of the same person (re-appointments).
    merged: list[dict] = []
    for t in terms:
        prev = next((m for m in reversed(merged) if m["qid"] == t["qid"]), None)
        if prev and (prev["end"] is None or prev["end"] >= t["start"] - dt.timedelta(days=2)):
            if prev["end"] is not None and (t["end"] is None or t["end"] > prev["end"]):
                prev["end"] = t["end"]
            continue
        merged.append(dict(t))
    return merged


def people(qids: list[str]) -> dict[str, dict]:
    """Name (English, or the multilingual default label) and English Wikipedia title."""
    ids = sorted(set(qids))
    out: dict[str, dict] = {}
    for i in range(0, len(ids), 40):
        ents = bm.api(bm.WIKIDATA, action="wbgetentities", ids="|".join(ids[i : i + 40]), props="labels|sitelinks", languages="en|mul")["entities"]
        for q, e in ents.items():
            lab = e.get("labels", {})
            name = (lab.get("en") or lab.get("mul") or {}).get("value", q)
            out[q] = {"name": name, "wiki": e.get("sitelinks", {}).get("enwiki", {}).get("title")}
    return out


def infobox_terms(title: str | None) -> list[tuple[str, dt.date | None, dt.date | None]]:
    if not title:
        return []
    d = bm.api(bm.WIKIPEDIA, action="query", prop="revisions", rvprop="content", rvslots="main", titles=title, formatversion=2, redirects=1)
    page = d["query"]["pages"][0]
    text = page.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("content", "")
    return bm.infobox_offices(text)


def close(a: dt.date | None, b: dt.date | None, today: dt.date) -> bool:
    """Two term bounds agree (45 days), treating 'open' and 'after today' alike."""
    a = None if a is None or a > today else a
    b = None if b is None or b > today else b
    if a is None or b is None:
        return a is None and b is None
    return abs((a - b).days) <= GAP_DAYS


def cross_check(term: dict, role: str, wiki: str | None, today: dt.date) -> str:
    """'both' (Wikidata and the Wikipedia infobox agree), 'wikidata' (no infobox
    record of the office), or 'conflict' (the two read differently: reported)."""
    pattern = re.compile(role, re.I)
    found = [(s, e) for o, s, e in infobox_terms(wiki) if pattern.search(o) and s is not None]
    if not found:
        return "wikidata"
    s, e = min(found, key=lambda x: abs((x[0] - term["start"]).days))
    return "both" if close(s, term["start"], today) and close(e, term["end"], today) else "conflict"


def gaps_of(terms: list[dict], today: dt.date) -> list[tuple[dt.date, dt.date]]:
    """Periods (1948..today) with no holder recorded."""
    out = []
    cursor = max(FROM, min((t["start"] for t in terms), default=FROM))
    for t in sorted(terms, key=lambda t: t["start"]):
        if (t["start"] - cursor).days > GAP_DAYS:
            out.append((cursor, t["start"]))
        end = t["end"] or today
        if end > cursor:
            cursor = end
    if (today - cursor).days > GAP_DAYS:
        out.append((cursor, today))
    return out


def portrait(info_file: str, qid: str) -> dict | None:
    name = urllib.parse.unquote(info_file.rsplit("/", 1)[1]).replace("_", " ")
    info = bm.commons_file(name, 480)
    if not info["ok"]:
        return {"error": info["reason"]}
    out = OUT_DIR / f"{qid}.webp"
    if not out.exists():
        bm.save_portrait(info, out)
    return {
        "src": f"media/leaders/{qid}.webp",
        "license": info["license"],
        "licenseUrl": info["licenseUrl"],
        "artist": info["artist"],
        "sourceUrl": info["sourceUrl"],
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="ignore the download cache")
    ap.add_argument("--no-portraits", action="store_true")
    args = ap.parse_args(argv)
    bm._refresh = args.refresh
    bm.PORTRAIT_PX = PORTRAIT_PX
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    today = dt.date.today()

    all_terms: list[dict] = []
    for office in OFFICES:
        terms = terms_of(office, today)
        for t in terms:
            t["office"] = office["id"]
        all_terms += terms
        print(f"{office['id']}: {len(terms)} terms", flush=True)

    # Gaps filled from content/leaders-extra.json: named people whose office on a
    # given day is verified (Wikidata, or their English Wikipedia infobox).
    extra_src = json.loads(EXTRA.read_text(encoding="utf-8"))["people"] if EXTRA.exists() else []
    by_id = {o["id"]: o for o in OFFICES}
    unverified: list[str] = []
    for x in extra_src:
        o = by_id[x["office"]]
        r = bm.verify_person(x["search"], o["role"], dt.date.fromisoformat(x["day"]), x.get("enwiki"))
        if not r["ok"] or not r.get("start"):
            unverified.append(f"{x['search']} ({o['title']}, {x['day']}): {r.get('reason', 'no start date')}")
            continue
        s, e = dt.date.fromisoformat(r["start"]), dt.date.fromisoformat(r["end"]) if r.get("end") else None
        if any(t["qid"] == r["qid"] and t["office"] == o["id"] for t in all_terms):
            continue
        all_terms.append({"office": o["id"], "qid": r["qid"], "start": s, "end": e, "image": None,
                          "status": "wikipedia" if "infobox" in r["source"] else "wikidata", "imageFile": r.get("image")})
    all_terms.sort(key=lambda t: (t["office"], t["start"]))

    info = people([t["qid"] for t in all_terms])
    names = {q: v["name"] for q, v in info.items()}
    conflicts: list[str] = []
    for t in all_terms:
        if "status" not in t:
            t["status"] = cross_check(t, by_id[t["office"]]["role"], info[t["qid"]]["wiki"], today)
        if t["status"] == "conflict":
            # Kept on Wikidata's dates: the infobox reader is the weaker source
            # (it often misreads people with two separate terms). Listed for review.
            conflicts.append(f"{names[t['qid']]} ({t['qid']}), {by_id[t['office']]['title']}: Wikidata {t['start']}..{t['end']}")
            t["status"] = "wikidata"
        if t.get("imageFile") and not t.get("image"):
            t["image"] = "/" + t["imageFile"].replace(" ", "_")
    gaps = []
    for office in OFFICES:
        for a, b in gaps_of([t for t in all_terms if t["office"] == office["id"]], today):
            gaps.append({"office": office["id"], "from": a.isoformat(), "to": b.isoformat()})
    portraits: dict[str, dict | None] = {}
    rejected: list[str] = []
    no_portrait = {o["id"] for o in OFFICES if o.get("portraits") is False}
    for t in all_terms:
        q = t["qid"]
        if args.no_portraits or t["office"] in no_portrait or not t["image"] or q in portraits:
            continue
        p = portrait(t["image"], q)
        if p and "error" in p:
            rejected.append(f"{names[q]} ({q}): {p['error']}")
            p = None
        portraits[q] = p

    data = {
        "source": "Wikidata (position held, with start and end dates); portraits from Wikimedia Commons",
        "generated": today.isoformat(),
        "offices": [{k: o[k] for k in ("id", "region", "qid", "title", "kind")} for o in OFFICES],
        "terms": [
            {
                "office": t["office"],
                "name": names[t["qid"]],
                "qid": t["qid"],
                "start": t["start"].isoformat(),
                "end": t["end"].isoformat() if t["end"] else None,
                "portrait": portraits.get(t["qid"]),
            }
            for t in all_terms
        ],
        "gaps": gaps,
    }
    for t, row in zip(all_terms, data["terms"]):
        row["verified"] = t["status"]
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    lines = [
        "# Leaders: verification report",
        "",
        f"Generated {today.isoformat()} by `scripts/build_leaders.py` from Wikidata (P39 position held, P580/P582).",
        "Each term below links to the person's Wikidata item. Periods with no recorded holder are listed as gaps;",
        "the app says \"no verified record\" for them instead of guessing.",
        "",
    ]
    lines += [
        "Status per term: **both** = Wikidata and the person's English Wikipedia infobox agree (45 days);",
        "**wikidata** = Wikidata only (no infobox record of the office); **wikipedia** = a gap filled from",
        "content/leaders-extra.json and verified on the infobox. Where the infobox reads differently, Wikidata's dates are kept",
        "and the term is listed at the end for review.",
        "",
    ]
    for o in OFFICES:
        lines += [f"## {o['title']} ([{o['qid']}](https://www.wikidata.org/wiki/{o['qid']}))", ""]
        for t in [t for t in all_terms if t["office"] == o["id"]]:
            p = portraits.get(t["qid"])
            lines.append(
                f"- {t['start']} to {t['end'] or 'present'}: {names[t['qid']]} "
                f"([{t['qid']}](https://www.wikidata.org/wiki/{t['qid']})) [{t['status']}]" + (f", portrait {p['license']}" if p else "")
            )
        g = [x for x in gaps if x["office"] == o["id"]]
        if g:
            lines.append("")
            lines += [f"- **Gap:** {x['from']} to {x['to']} (no holder recorded)" for x in g]
        lines.append("")
    if conflicts:
        lines += ["## For review: the Wikipedia infobox reads differently (Wikidata kept)", ""] + [f"- {c}" for c in conflicts] + [""]
    if unverified:
        lines += ["## Gap candidates not verified", ""] + [f"- {u}" for u in unverified] + [""]
    if rejected:
        lines += ["## Portraits not used (license)", ""] + [f"- {r}" for r in rejected] + [""]
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"conflicts={len(conflicts)} unverified={len(unverified)}")
    print(f"terms={len(all_terms)} portraits={sum(1 for p in portraits.values() if p)} rejected={len(rejected)} gaps={len(gaps)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
