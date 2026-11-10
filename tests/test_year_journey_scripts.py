"""Tests for the Year Journey's offline scripts: event verification
(build_events.py), leader terms (build_leaders.py) and the contest-safe
stripping of people (strip_people.py)."""
import datetime as dt
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_events  # noqa: E402
import build_leaders  # noqa: E402
import strip_people  # noqa: E402


def test_date_variants_and_precision():
    n = build_events.normalize
    assert n("22 September 1985") in build_events.date_variants("1985-09-22")
    assert n("September 22, 1985") in build_events.date_variants("1985-09-22")
    assert n("October 08, 2008") in build_events.date_variants("2008-10-08")  # zero-padded, as the Fed writes it
    assert build_events.date_variants("1971-12-01", "month") == [n("December 1971")]
    assert build_events.date_variants("2022-01-01", "year") == [n("2022")]
    # Whole words: May 1 is not May 10.
    assert not build_events.has_date("On May 10, 1971 the Mark floated.", "1971-05-01")
    assert build_events.has_date("met today, September 22,1985 in", "1985-09-22")


def test_passes_needs_date_and_every_keyword():
    text = "On 22 September 1985 the G5 met at the Plaza Hotel (the Plaza Accord)."
    assert build_events.passes(text, "1985-09-22", ["Plaza"])
    assert not build_events.passes(text, "1985-09-23", ["Plaza"])
    assert not build_events.passes(text, "1985-09-22", ["Plaza", "Louvre"])
    # Ordinals and non-breaking spaces are normalized.
    assert build_events.passes("on September 22nd, 1985", "1985-09-22", [])


def test_same_page_is_not_enough():
    """The date and the keyword must be in one passage (a sentence and the next), not anywhere on the page."""
    page = (
        "== October 24, 1969 (Friday) == Two spies were released from prison in Great Britain. "
        "The weather was mild. Nothing else happened that day. "
        "Later that year the Mark was revalued."
    )
    assert not build_events.passes(page, "1969-10-24", ["Mark"])
    assert build_events.passes("On 24 October 1969 the Mark was revalued.", "1969-10-24", ["Mark"])
    two = "On 24 October 1969 the government decided. The Mark was revalued by 9.3%."
    assert build_events.passes(two, "1969-10-24", ["Mark"])
    assert build_events.matching_passage(two, "1969-10-24", ["decided"]) == "On 24 October 1969 the government decided."


def test_quotes_and_their_dates():
    pdf_like = "In 1971 world curren cies provisionally went into the floating exchange rate system (on August 28, for Japan)."
    quote = "world currencies provisionally went into the floating exchange rate system (on August 28, for Japan)"
    assert build_events.quote_found(pdf_like, quote) >= 0  # stray PDF spaces do not matter
    assert build_events.quote_found(pdf_like, "the yen was fixed") < 0
    assert build_events.quote_dates(pdf_like, quote, "1971-08-28")  # day and month in the quote, year close by
    assert not build_events.quote_dates(pdf_like, quote, "1971-08-15")
    far = "The meeting (on August 28) was long." + " x" * 2000 + " 1971"
    assert not build_events.quote_dates(far, "The meeting (on August 28)", "1971-08-28")  # year too far away
    assert build_events.quote_dates("x", "met today, September 22,1985", "1985-09-22") is True  # full date in the quote


FEIO = """header,,,,,,,,,
,,,,,,,,,
x,x,x,1998,Jun,17,"2,312",x,the US dollar (sold) the Japanese yen (bought)
x,x,x,2022,Sep,22,"28,382",x,the US dollar (sold) the Japanese yen (bought)
x,,,July - September 2022,,,"28,382",,
x,x,x,2022,Oct,21,"56,202",x,the US dollar (sold) the Japanese yen (bought)
,,,,,24,"7,296",x,the US dollar (sold) the Japanese yen (bought)
"""


def test_mof_intervention_rows():
    rows = build_events.feio_rows(FEIO)
    assert [r["date"] for r in rows] == ["1998-06-17", "2022-09-22", "2022-10-21", "2022-10-24"]
    ok = {"row": {"date": "2022-09-22", "amount": "28,382"}, "previous": "1998-06-17"}
    assert build_events.feio_check(rows, ok) is None
    assert "amount" in build_events.feio_check(rows, {"row": {"date": "2022-09-22", "amount": "1"}})
    assert "no intervention" in build_events.feio_check(rows, {"row": {"date": "2022-09-23", "amount": "28,382"}})
    late = {"row": {"date": "2022-10-21", "amount": "56,202"}, "previous": "1998-06-17"}
    assert "before" in build_events.feio_check(rows, late)


def test_review_needs_a_dated_quote():
    texts = {"s": "Statement. March 16, 2022. The Committee decided to raise the target range."}
    ev = {"date": "2022-03-16", "evidence": [{"source": "s", "quote": "decided to raise the target range"}]}
    assert build_events.review(ev, texts, []) == ["no quote gives the event's date"]
    ev["evidence"].append({"source": "s", "quote": "March 16, 2022", "date": True})
    assert build_events.review(ev, texts, []) == []
    ev["evidence"].append({"source": "s", "quote": "lowered the rate"})
    assert "quote not found" in build_events.review(ev, texts, [])[0]


def test_event_file_structure():
    src = json.loads((ROOT / "content" / "annual-events.json").read_text(encoding="utf-8"))["events"]
    sources = json.loads((ROOT / "content" / "sources.json").read_text(encoding="utf-8"))["sources"]
    assert build_events.check(src, sources) == []
    # A featured-year event without evidence is an error.
    bare = [{**e, "evidence": []} for e in src if e["id"] == "dollar-adjustment"]
    assert any("needs evidence" in x for x in build_events.check(bare, sources))
    out = json.loads((ROOT / "public" / "data" / "annual-events.json").read_text(encoding="utf-8"))["events"]
    ids = {e["id"] for e in src}
    for e in out:
        assert e["id"] in ids
        assert e["sources"], e["id"]
        assert "keys" not in e and "evidence" not in e
        assert e["status"] in ("reviewed", "matched")
        if int(e["date"][:4]) in build_events.FEATURED_YEARS:
            assert e["status"] == "reviewed", e["id"]
            assert any(s["primary"] for s in e["sources"]), e["id"]
    by_id = {e["id"]: e for e in out}
    # The interventions, on their days, from the Ministry of Finance's own records.
    assert by_id["yen-intervention-2022"]["date"] == "2022-09-22"
    assert by_id["yen-intervention-2022-10"]["date"] == "2022-10-21"
    assert by_id["yen-2026"]["date"] == "2026-07-31"
    for k in ("yen-intervention-2022", "yen-2026"):
        assert by_id[k]["status"] == "reviewed" and "precision" not in by_id[k]
        assert any(s["publisher"] == "Ministry of Finance Japan" for s in by_id[k]["sources"])


def test_leader_term_helpers():
    today = dt.date(2026, 11, 10)
    # Bounds agree within 45 days; "open" and "after today" count as the same.
    assert build_leaders.close(dt.date(1985, 1, 1), dt.date(1985, 1, 20), today)
    assert not build_leaders.close(dt.date(1985, 1, 1), dt.date(1985, 6, 1), today)
    assert build_leaders.close(None, dt.date(2027, 2, 1), today)
    terms = [
        {"start": dt.date(1949, 1, 1), "end": dt.date(1960, 1, 1)},
        {"start": dt.date(1961, 1, 1), "end": None},
    ]
    gaps = build_leaders.gaps_of(terms, today)
    assert gaps == [(dt.date(1960, 1, 1), dt.date(1961, 1, 1))]


def test_leaders_file_covers_every_head_of_government_year():
    data = json.loads((ROOT / "public" / "data" / "leaders.json").read_text(encoding="utf-8"))
    heads = {o["id"] for o in data["offices"] if o["kind"] == "head"}
    for office in ["us-president", "uk-pm", "jp-pm", "de-chancellor", "ca-pm", "au-pm", "in-pm", "kr-president"]:
        assert office in heads
        assert any(t["office"] == office for t in data["terms"])
    # Every portrait file listed exists.
    for t in data["terms"]:
        if t["portrait"]:
            assert (ROOT / "public" / t["portrait"]["src"]).exists(), t["portrait"]["src"]


def test_strip_people():
    # A scratch folder inside the (gitignored) data-raw/: the system temp dir is not always writable here.
    (ROOT / "data-raw").mkdir(exist_ok=True)
    tmp_path = Path(tempfile.mkdtemp(dir=ROOT / "data-raw"))
    try:
        _strip_people_in(tmp_path)
    finally:
        shutil.rmtree(tmp_path, ignore_errors=True)


def _strip_people_in(tmp_path):
    (tmp_path / "index.html").write_text("<html></html>")
    (tmp_path / "data").mkdir()
    (tmp_path / "media" / "leaders").mkdir(parents=True)
    (tmp_path / "media" / "people").mkdir(parents=True)
    (tmp_path / "media" / "places").mkdir(parents=True)
    (tmp_path / "data" / "leaders.json").write_text(json.dumps({"terms": [{"name": "A Person", "portrait": {"src": "x"}}]}))
    (tmp_path / "data" / "history-content.json").write_text(json.dumps({"events": [{"id": "e", "people": [{"name": "B"}]}]}))
    sources = [
        {"publisher": "Wikipedia", "title": "Kim Young-sam", "url": "https://en.wikipedia.org/wiki/Kim_Young-sam", "primary": False},
        {"publisher": "International Monetary Fund", "title": "Letter of Intent", "url": "https://www.imf.org/x", "primary": True},
    ]
    (tmp_path / "data" / "annual-events.json").write_text(json.dumps({"events": [{"id": "x", "sources": sources}]}))
    report = strip_people.strip(tmp_path)
    assert report["leaders"] == 1 and report["cards"] == 1
    leaders = json.loads((tmp_path / "data" / "leaders.json").read_text())
    assert leaders["terms"][0]["name"] == "" and leaders["terms"][0]["portrait"] is None
    assert json.loads((tmp_path / "data" / "history-content.json").read_text())["events"][0]["people"] == []
    assert not (tmp_path / "media" / "leaders").exists() and not (tmp_path / "media" / "people").exists()
    assert (tmp_path / "media" / "places").exists()
    ev = json.loads((tmp_path / "data" / "annual-events.json").read_text())["events"][0]
    assert ev["sources"] == [
        {"publisher": "Wikipedia", "title": "", "url": "", "primary": False},
        {"publisher": "International Monetary Fund", "title": "", "url": "", "primary": True},
    ]
