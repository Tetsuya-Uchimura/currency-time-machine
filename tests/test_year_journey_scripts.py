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
    assert "22 September 1985" in build_events.date_variants("1985-09-22")
    assert "September 22, 1985" in build_events.date_variants("1985-09-22")
    assert build_events.date_variants("1971-12-01", "month") == ["December 1971"]
    assert build_events.date_variants("2022-01-01", "year") == ["2022"]


def test_passes_needs_date_and_every_keyword():
    text = "On 22 September 1985 the G5 met at the Plaza Hotel (the Plaza Accord)."
    assert build_events.passes(text, "1985-09-22", ["Plaza"])
    assert not build_events.passes(text, "1985-09-23", ["Plaza"])
    assert not build_events.passes(text, "1985-09-22", ["Plaza", "Louvre"])
    # Ordinals and non-breaking spaces are normalized.
    assert build_events.passes("on September 22nd, 1985", "1985-09-22", [])


def test_event_file_structure():
    src = json.loads((ROOT / "content" / "annual-events.json").read_text(encoding="utf-8"))["events"]
    assert build_events.check(src) == []
    out = json.loads((ROOT / "public" / "data" / "annual-events.json").read_text(encoding="utf-8"))["events"]
    ids = {e["id"] for e in src}
    for e in out:
        assert e["id"] in ids
        assert e["sources"], e["id"]
        assert "keys" not in e


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
    (tmp_path / "data" / "annual-events.json").write_text(json.dumps({"events": [{"id": "x", "sources": [{"title": "Kim Young-sam", "url": "https://en.wikipedia.org/wiki/Kim_Young-sam"}]}]}))
    report = strip_people.strip(tmp_path)
    assert report["leaders"] == 1 and report["cards"] == 1
    leaders = json.loads((tmp_path / "data" / "leaders.json").read_text())
    assert leaders["terms"][0]["name"] == "" and leaders["terms"][0]["portrait"] is None
    assert json.loads((tmp_path / "data" / "history-content.json").read_text())["events"][0]["people"] == []
    assert not (tmp_path / "media" / "leaders").exists() and not (tmp_path / "media" / "people").exists()
    assert (tmp_path / "media" / "places").exists()
    ev = json.loads((tmp_path / "data" / "annual-events.json").read_text())["events"][0]
    assert ev["sources"] == [{"title": "Wikipedia", "url": ""}]
