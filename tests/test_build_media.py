"""Tests for the pure helpers of scripts/build_media.py (no network)."""
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_media as bm  # noqa: E402

D = dt.date


def test_parse_wikidata_time():
    assert bm.parse_wd_time("+1969-01-20T00:00:00Z") == D(1969, 1, 20)
    assert bm.parse_wd_time("+1985-00-00T00:00:00Z") == D(1985, 1, 1)
    assert bm.parse_wd_time(None) is None


def test_held_on_needs_a_start_and_respects_the_end():
    assert bm.held_on(D(1985, 2, 4), D(1988, 8, 17), D(1985, 9, 22))
    assert not bm.held_on(D(1985, 2, 4), D(1988, 8, 17), D(1989, 1, 1))
    assert not bm.held_on(None, None, D(1985, 9, 22)), "undated offices are not accepted"
    assert bm.held_on(D(2006, 2, 1), None, D(2008, 10, 8))


def test_license_allowlist():
    for ok in ["Public domain", "CC BY 2.0", "CC BY-SA 3.0 de", "CC0", "KOGL Type 1", "CC BY 4.0", "OGL 3", "GODL-India", "GFDL 1.2", "Attribution", "Copyrighted free use"]:
        assert bm.license_ok(ok), ok
    for bad in ["", "Fair use", "Non-free", "All rights reserved", "CC BY-NC 2.0", "CC BY-ND 4.0", "Attribution-NonCommercial"]:
        assert not bm.license_ok(bad), bad


def test_wiki_dates():
    assert bm.parse_wiki_date("{{start date|1982|11|27}}") == D(1982, 11, 27)
    assert bm.parse_wiki_date("{{End date|df=y|1986|7|22}}") == D(1986, 7, 22)
    assert bm.parse_wiki_date("27 November 1982") == D(1982, 11, 27)
    assert bm.parse_wiki_date("November 27, 1982") == D(1982, 11, 27)
    assert bm.parse_wiki_date("1982") is None, "year only is not precise enough"


def test_infobox_continuation_terms_and_embedded_boxes():
    text = """{{Infobox officeholder
| office1 = Prime Minister of Japan
| term_start1 = 6 November 1987
| term_end1 = 3 June 1989
}}
{{Infobox officeholder
| embed = yes
| office2 = [[Minister of Finance (Japan)|Minister of Finance]]
| term_start2 = 9 December 1988
| term_end2 = 24 December 1988
| term_start3 = 27 November 1982
| term_end3 = 22 July 1986
}}"""
    offices = bm.infobox_offices(text)
    assert ("Prime Minister of Japan", D(1987, 11, 6), D(1989, 6, 3)) in offices
    assert ("Minister of Finance", D(1982, 11, 27), D(1986, 7, 22)) in offices, "a term without officeN continues the office"


def test_generated_content_only_has_verified_people_and_accepted_media():
    content = json.loads((ROOT / "public" / "data" / "history-content.json").read_text(encoding="utf-8"))
    for ev in content["events"]:
        day = D.fromisoformat(ev["date"])
        for p in ev["people"]:
            v = p["verified"]
            assert v["source"] and v["qid"].startswith("Q")
            assert bm.held_on(D.fromisoformat(v["start"]), D.fromisoformat(v["end"]) if v["end"] else None, day), p["name"]
            if p["portrait"]:
                assert bm.license_ok(p["portrait"]["license"])
                assert (ROOT / "public" / p["portrait"]["src"]).exists()
        for ph in (ev.get("portal") or {}).get("photos", []):
            assert bm.license_ok(ph["license"]) and ph["artist"] and ph["sourceUrl"].startswith("https://commons.wikimedia.org/")
            assert (ROOT / "public" / ph["src"]).exists() and ph["width"] <= 1024
