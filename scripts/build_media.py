"""
Build the historical cards' content and media from content/history.json.

For every person on every event card:
  1. find the person on Wikidata (a human whose "position held" matches the
     role), and check that they held that office on the event's date
     (start <= date <= end). People who cannot be verified are left out of
     the app and listed in the report;
  2. take the portrait Wikidata lists for them (P18), check its license on
     Wikimedia Commons, and save an optimized local WebP with its credit.
For every city photo: check the license on Commons and save a local WebP.

Outputs (all committed, so the app never calls these services at runtime):
  public/media/people/<key>.webp, public/media/places/<key>.webp
  public/data/history-content.json   what the app shows (verified facts only)
  docs/history-verification.md       the evidence: offices, dates, licenses

Only these licenses are accepted: public domain, CC0, CC BY, CC BY-SA,
KOGL Type 1, OGL (UK Open Government Licence), GODL-India, GFDL,
"Attribution" and "Copyrighted free use": all allow reuse with attribution,
which the app shows with every image. Anything else is skipped and reported.

Usage:  python scripts/build_media.py [--refresh]
Standard library + Pillow. Requests are spaced politely and cached in
data-raw/media/ (gitignored).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "history.json"
CACHE = ROOT / "data-raw" / "media"
OUT_PEOPLE = ROOT / "public" / "media" / "people"
OUT_PLACES = ROOT / "public" / "media" / "places"
OUT_JSON = ROOT / "public" / "data" / "history-content.json"
REPORT = ROOT / "docs" / "history-verification.md"

UA = "CurrencyTimeMachineBuild/0.1 (https://github.com/Tetsuya-Uchimura/currency-time-machine)"
WIKIDATA = "https://www.wikidata.org/w/api.php"
WIKIPEDIA = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
DELAY_S = 0.6

# No NC (non-commercial) or ND (no derivatives): we crop and re-encode.
# Free licenses that allow reuse with attribution (the app shows author, license and source with every image).
# Fair use / non-free files are never accepted.
ALLOWED_LICENSES = re.compile(
    r"^(public domain|pd\b|cc0|cc[ -]by(-sa)?(\s|$)|kogl type 1|ogl\b|godl-india|gfdl|attribution$|copyrighted free use)",
    re.I,
)

PORTRAIT_PX = 288
PLACE_MAX_W = 1024


# ---------------------------------------------------------------------------
# HTTP with cache
# ---------------------------------------------------------------------------

_refresh = False


def fetch(url: str, binary: bool = False):
    key = hashlib.sha1(url.encode()).hexdigest()
    path = CACHE / (key + (".bin" if binary else ".json"))
    if path.exists() and not _refresh:
        data = path.read_bytes()
        return data if binary else json.loads(data)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < 4:
                time.sleep(float(e.headers.get("Retry-After") or 5))
                continue
            raise
    time.sleep(DELAY_S)
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data if binary else json.loads(data)


def api(base: str, **params) -> dict:
    return fetch(base + "?" + urllib.parse.urlencode({**params, "format": "json"}))


# ---------------------------------------------------------------------------
# Pure helpers (unit tested)
# ---------------------------------------------------------------------------


def parse_wd_time(value: str | None) -> dt.date | None:
    """Wikidata time '+1969-01-20T00:00:00Z' -> date (unknown month/day -> 1)."""
    if not value:
        return None
    m = re.match(r"^[+-]?(\d{4})-(\d{2})-(\d{2})", value)
    if not m:
        return None
    y, mo, d = int(m.group(1)), max(1, int(m.group(2))), max(1, int(m.group(3)))
    return dt.date(y, mo, d)


def held_on(start: dt.date | None, end: dt.date | None, day: dt.date) -> bool:
    """True if an office with these bounds was held on `day` (needs a start)."""
    if start is None or start > day:
        return False
    return end is None or day <= end


MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}


def parse_wiki_date(value: str) -> dt.date | None:
    """A full date from an infobox value ({{start date|1982|11|27}}, '27 November 1982',
    'November 27, 1982'). Year-only or unparseable values return None (not precise enough)."""
    v = value or ""
    m = re.search(r"\{\{\s*(?:start|end)[ _]date(?:[ _]and[ _]age)?\s*\|\s*(?:df=y(?:es)?\s*\|\s*)?(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", v, re.I)
    if m:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    text = re.sub(r"\[\[|\]\]|\{\{[^}]*\}\}|<[^>]+>", " ", v)
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text)
    if m and m.group(2).lower() in MONTHS:
        return dt.date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
    m = re.search(r"([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})", text)
    if m and m.group(1).lower() in MONTHS:
        return dt.date(int(m.group(3)), MONTHS[m.group(1).lower()], int(m.group(2)))
    return None


def infobox_offices(wikitext: str) -> list[tuple[str, dt.date | None, dt.date | None]]:
    """Offices with term dates from officeholder infoboxes (office, office2, ...).
    Embedded infoboxes (collapsed "ministerial offices" sections) reuse the same
    parameter names, so each infobox block is read on its own."""
    out = []
    for block in re.split(r"\{\{\s*Infobox", wikitext, flags=re.I)[1:]:
        out.extend(_block_offices(block))
    return out


def _block_offices(block: str) -> list[tuple[str, dt.date | None, dt.date | None]]:
    params: dict[str, str] = {}
    for m in re.finditer(r"^\s*\|\s*([a-z_]+\d*)\s*=\s*(.*)$", block, re.M):
        params.setdefault(m.group(1).strip(), m.group(2).strip())
    # Terms are numbered (office2/term_start2 ...). A term without its own
    # officeN is a further term of the previous office (infobox convention).
    indices = sorted(
        {int(m.group(1) or 1) for k in params for m in [re.fullmatch(r"(?:office|term_start)(\d*)", k)] if m}
    )
    out = []
    last_title = None
    for n in indices:
        suffix = "" if n == 1 and "office" in params else str(n)
        raw = params.get(f"office{suffix}") or (params.get("office") if n == 1 else None)
        if raw:
            title = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", raw)
            title = re.sub(r"<[^>]+>|\{\{[^}]*\}\}|'{2,3}", " ", title)
            last_title = re.sub(r"\s+", " ", title).strip()
        if not last_title:
            continue
        start = params.get(f"term_start{suffix}") or (params.get("term_start1") if n == 1 else "")
        end = params.get(f"term_end{suffix}") or (params.get("term_end1") if n == 1 else "")
        out.append((last_title, parse_wiki_date(start or ""), parse_wiki_date(end or "")))
    return out


def license_ok(short_name: str) -> bool:
    return bool(ALLOWED_LICENSES.match((short_name or "").strip()))


def strip_html(s: str | None) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


# ---------------------------------------------------------------------------
# Wikidata: who held which office when
# ---------------------------------------------------------------------------


def entities(ids: list[str], props: str) -> dict:
    out: dict = {}
    for i in range(0, len(ids), 40):
        out.update(api(WIKIDATA, action="wbgetentities", ids="|".join(ids[i : i + 40]), props=props, languages="en")["entities"])
    return out


def claim_values(ent: dict, prop: str) -> list[dict]:
    return ent.get("claims", {}).get(prop, [])


def positions_of(ent: dict) -> list[tuple[str, dt.date | None, dt.date | None]]:
    out = []
    for c in claim_values(ent, "P39"):
        snak = c.get("mainsnak", {})
        if snak.get("snaktype") != "value":
            continue
        qid = snak["datavalue"]["value"]["id"]
        q = c.get("qualifiers", {})
        start = parse_wd_time(q["P580"][0]["datavalue"]["value"]["time"]) if q.get("P580") and q["P580"][0].get("datavalue") else None
        end = parse_wd_time(q["P582"][0]["datavalue"]["value"]["time"]) if q.get("P582") and q["P582"][0].get("datavalue") else None
        out.append((qid, start, end))
    return out


def verify_person(search: str | list[str], role_re: str, day: dt.date, enwiki: str | None = None) -> dict:
    """Find the person and the office they held on `day`. Returns a result dict.
    Wikidata first; if it has no dated record of the office, the person's
    English Wikipedia infobox (office + term dates) is used as the source."""
    names = [search] if isinstance(search, str) else search
    hits, seen = [], set()
    if enwiki:
        # An explicit English Wikipedia title pins the exact person.
        ents = api(WIKIDATA, action="wbgetentities", sites="enwiki", titles=enwiki, props="info")["entities"]
        for qid in ents:
            if qid.startswith("Q"):
                seen.add(qid)
                hits.append({"id": qid})
    for name in names:
        lang = "ko" if re.search(r"[가-힣]", name) else "ja" if re.search(r"[぀-ヿ一-鿿]", name) else "en"
        for h in api(WIKIDATA, action="wbsearchentities", search=name, language=lang, type="item", limit=7)["search"]:
            if h["id"] not in seen:
                seen.add(h["id"])
                hits.append(h)
    if not hits:
        return {"ok": False, "reason": "not found on Wikidata"}
    ents = entities([h["id"] for h in hits], "claims|labels|descriptions|sitelinks")
    pattern = re.compile(role_re, re.I)
    tried = []
    humans = []
    for h in hits:
        ent = ents.get(h["id"], {})
        if not any(c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id") == "Q5" for c in claim_values(ent, "P31")):
            continue
        humans.append((h, ent))
        pos = positions_of(ent)
        labels = entities(sorted({p[0] for p in pos}), "labels") if pos else {}
        for qid, start, end in pos:
            label = labels.get(qid, {}).get("labels", {}).get("en", {}).get("value", qid)
            if not pattern.search(label):
                continue
            tried.append(f"{label} ({start}..{end})")
            if held_on(start, end, day):
                img = claim_values(ent, "P18")
                return {
                    "ok": True,
                    "source": "Wikidata",
                    "qid": h["id"],
                    "label": ent.get("labels", {}).get("en", {}).get("value", names[0]),
                    "position": label,
                    "positionQid": qid,
                    "start": start.isoformat() if start else None,
                    "end": end.isoformat() if end else None,
                    "image": img[0]["mainsnak"]["datavalue"]["value"] if img and img[0]["mainsnak"].get("datavalue") else None,
                    "wiki": ent.get("sitelinks", {}).get("enwiki", {}).get("title"),
                }
        if tried:
            return {"ok": False, "qid": h["id"], "reason": "office found but not held on the date: " + "; ".join(tried)}

    # Fallback: the English Wikipedia infobox of the first human candidates.
    for h, ent in humans[:2]:
        title = ent.get("sitelinks", {}).get("enwiki", {}).get("title")
        if not title:
            continue
        d = api(WIKIPEDIA, action="query", prop="revisions", rvprop="content|ids", rvslots="main", titles=title, formatversion=2, redirects=1)
        page = d["query"]["pages"][0]
        rev = page.get("revisions", [{}])[0]
        text = rev.get("slots", {}).get("main", {}).get("content", "")
        for office, start, end in infobox_offices(text):
            if pattern.search(office) and held_on(start, end, day):
                img = claim_values(ent, "P18")
                return {
                    "ok": True,
                    "source": f"English Wikipedia infobox ({title}, revision {rev.get('revid')})",
                    "qid": h["id"],
                    "label": ent.get("labels", {}).get("en", {}).get("value", names[0]),
                    "position": office,
                    "positionQid": None,
                    "start": start.isoformat() if start else None,
                    "end": end.isoformat() if end else None,
                    "image": img[0]["mainsnak"]["datavalue"]["value"] if img and img[0]["mainsnak"].get("datavalue") else None,
                    "wiki": title,
                }
    return {"ok": False, "reason": f"no dated record of a matching office ('{role_re}') in Wikidata or the English Wikipedia infobox"}


# ---------------------------------------------------------------------------
# Commons: license and image
# ---------------------------------------------------------------------------


def commons_file(name: str, width: int) -> dict:
    d = api(COMMONS, action="query", titles="File:" + name, prop="imageinfo", iiprop="url|extmetadata|size", iiurlwidth=width)
    page = next(iter(d["query"]["pages"].values()))
    if "imageinfo" not in page:
        return {"ok": False, "reason": "file not found on Commons"}
    ii = page["imageinfo"][0]
    meta = ii.get("extmetadata", {})
    val = lambda k: (meta.get(k) or {}).get("value", "")  # noqa: E731
    lic = strip_html(val("LicenseShortName"))
    return {
        "ok": license_ok(lic),
        "reason": "" if license_ok(lic) else f"license not accepted: {lic or 'unknown'}",
        "file": name,
        "license": lic,
        "licenseUrl": strip_html(val("LicenseUrl")),
        "artist": strip_html(val("Artist"))[:160] or "Unknown",
        "credit": strip_html(val("Credit"))[:200],
        "date": strip_html(val("DateTimeOriginal"))[:60],
        "sourceUrl": ii["descriptionurl"],
        "thumb": ii.get("thumburl") or ii["url"],
    }


def save_portrait(info: dict, out: Path, crop: dict | None = None) -> None:
    im = Image.open(io.BytesIO(fetch(info["thumb"], binary=True))).convert("RGB")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2  # square: centered horizontally, from the top (faces)
    im = im.crop((left, 0, left + side, side))
    if crop:  # optional zoom on the face, in fractions of that square
        sz = crop["size"] * side
        x0 = min(max(0, crop["cx"] * side - sz / 2), side - sz)
        y0 = min(max(0, crop["cy"] * side - sz / 2), side - sz)
        im = im.crop((round(x0), round(y0), round(x0 + sz), round(y0 + sz)))
    im = im.resize((PORTRAIT_PX, PORTRAIT_PX), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "WEBP", quality=82, method=6)


def save_place(info: dict, out: Path) -> tuple[int, int]:
    im = Image.open(io.BytesIO(fetch(info["thumb"], binary=True))).convert("RGB")
    if im.width > PLACE_MAX_W:
        im = im.resize((PLACE_MAX_W, round(im.height * PLACE_MAX_W / im.width)), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "WEBP", quality=80, method=6)
    return im.size


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    global _refresh
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="ignore the download cache")
    args = ap.parse_args(argv)
    _refresh = args.refresh

    src = json.loads(CONTENT.read_text(encoding="utf-8"))
    people_src, photos_src = src["people"], src["photos"]
    portraits: dict[str, dict] = {}
    places: dict[str, dict] = {}
    report_events = []
    out_events = []

    for ev in src["events"]:
        day = dt.date.fromisoformat(ev["date"])
        people_out, rows = [], []
        for ref in ev["people"]:
            p = people_src[ref["person"]]
            v = verify_person(p["search"], ref["roleMatch"], day, p.get("enwiki"))
            row = {"key": ref["person"], "name": p["name"], "role": ref["role"], "check": v, "portrait": None}
            if v["ok"]:
                portrait = None
                if v.get("image"):
                    if ref["person"] not in portraits:
                        info = commons_file(v["image"], 480)
                        if info["ok"]:
                            dest = OUT_PEOPLE / f"{ref['person']}.webp"
                            save_portrait(info, dest, p.get("crop"))
                            info["src"] = f"media/people/{ref['person']}.webp"
                        portraits[ref["person"]] = info
                    info = portraits[ref["person"]]
                    row["portrait"] = info
                    if info["ok"]:
                        portrait = {k: info[k] for k in ("src", "license", "licenseUrl", "artist", "sourceUrl", "date")}
                people_out.append({
                    "key": ref["person"],
                    "name": p["name"],
                    "role": ref["role"],
                    "involvement": ref["involvement"],
                    "verified": {k: v[k] for k in ("source", "qid", "position", "start", "end")},
                    "portrait": portrait,
                })
            rows.append(row)
            print(f"  {ev['id']:<18} {p['name']:<22} {'OK ' if v['ok'] else 'NO '} {v.get('position') or v.get('reason')}")

        photos_out = []
        for key in (ev.get("portal") or {}).get("photos", []):
            ph = photos_src[key]
            if key not in places:
                info = commons_file(ph["file"], 1280)
                if info["ok"]:
                    w, h = save_place(info, OUT_PLACES / f"{key}.webp")
                    info.update(src=f"media/places/{key}.webp", width=w, height=h)
                places[key] = info
            info = places[key]
            if info["ok"]:
                photos_out.append({
                    "key": key,
                    "src": info["src"],
                    "width": info["width"],
                    "height": info["height"],
                    "caption": ph["caption"],
                    "taken": ph["taken"],
                    **{k: info[k] for k in ("license", "licenseUrl", "artist", "sourceUrl")},
                })
            print(f"  {ev['id']:<18} photo {key:<26} {'OK ' if info['ok'] else 'NO '} {info.get('license') or info.get('reason')}")

        out = {k: ev[k] for k in ("id", "date", "title", "where", "summary", "policies", "currencies")}
        out["people"] = people_out
        if ev.get("portal"):
            out["portal"] = {"period": ev["portal"]["period"], "photos": photos_out}
        out_events.append(out)
        report_events.append((ev, rows, [(k, places[k]) for k in (ev.get("portal") or {}).get("photos", [])]))

    OUT_JSON.write_text(
        json.dumps({"generatedBy": "scripts/build_media.py", "events": out_events}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    write_report(report_events)
    print(f"wrote {OUT_JSON.relative_to(ROOT)} and {REPORT.relative_to(ROOT)}")
    return 0


def write_report(events) -> None:
    L = [
        "# Historical content: verification record",
        "",
        "Generated by `scripts/build_media.py` from `content/history.json`. Do not edit by hand.",
        "",
        "- **Offices:** each person's office on the event date was checked against Wikidata (`position held`",
        "  with start and end dates) or, where Wikidata has no dated record of that office, against the term dates",
        "  in the person's English Wikipedia infobox (the source is named per row). People who could not be",
        "  verified are not shown in the app.",
        "- **Images:** portraits are the images Wikidata lists for the person (P18); city photos were chosen by hand.",
        "  Every image's license was read from Wikimedia Commons; only public domain, CC0, CC BY, CC BY-SA,",
        "  KOGL Type 1, OGL, GODL-India, GFDL, Attribution and Copyrighted free use (all reusable with attribution,",
        "  shown with every image) are accepted. Images are stored locally as optimized WebP files.",
        "- **Not verified here:** the wording of each person's involvement and of the policies is our own summary",
        "  of the public record; it is not checked automatically. Rate figures are checked against the bundled",
        "  data by `tests/history.test.ts`.",
        "- **Competition rules:** the app shows real people (names and portraits). Rule 17 of the competition",
        "  restricts depicting identifiable people other than the entrant. This has **not** been cleared with the",
        "  organizers; it must be confirmed before submission.",
        "",
    ]
    for ev, rows, photos in events:
        L += [f"## {ev['date']} {ev['title']} (`{ev['id']}`)", ""]
        L += ["| Person | Role shown | Wikidata office on the date | Portrait | License | Source |", "| --- | --- | --- | --- | --- | --- |"]
        for r in rows:
            c = r["check"]
            office = (
                f"[{c['qid']}](https://www.wikidata.org/wiki/{c['qid']}) {c['position']} ({c['start']} to {c['end'] or 'open'}); source: {c['source']}"
                if c["ok"]
                else f"**not verified**: {c.get('reason', '')}"
            )
            pi = r["portrait"]
            if not c["ok"]:
                pcell, lic, srcu = "excluded", "", ""
            elif not pi:
                pcell, lic, srcu = "none on Wikidata", "", ""
            elif not pi["ok"]:
                pcell, lic, srcu = "rejected", pi.get("reason", ""), pi.get("sourceUrl", "")
            else:
                pcell, lic, srcu = f"`{pi['src']}` ({pi['artist']})", pi["license"], pi["sourceUrl"]
            L.append(f"| {r['name']} | {r['role']} | {office} | {pcell} | {lic} | {srcu} |")
        if photos:
            L += ["", "| Photo | Taken | License | Author | Source |", "| --- | --- | --- | --- | --- |"]
            for key, info in photos:
                if info["ok"]:
                    L.append(f"| `{info['src']}` | {info['date']} | {info['license']} | {info['artist']} | {info['sourceUrl']} |")
                else:
                    L.append(f"| {key} (**not used**) | | {info.get('reason', '')} | | {info.get('sourceUrl', '')} |")
        L.append("")
    REPORT.write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    sys.exit(main())
