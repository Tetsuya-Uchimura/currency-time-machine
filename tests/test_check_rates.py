"""Tests for scripts/check_rates.py (the H.10 cross-check) and scripts/review_featured.py."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import check_rates as cr  # noqa: E402
import review_featured as rf  # noqa: E402

CSV = """observation_date,DEXUSUK
1985-02-25,1.0520
1985-02-26,.
1985-02-27,1.0800
"""


def test_parse_fred_inverts_usd_per_unit_and_skips_gaps():
    dates, values = cr.parse_fred(CSV, invert=True)
    assert dates == ["1985-02-25", "1985-02-27"]
    assert abs(values[0] - 1 / 1.052) < 1e-12


def test_rate_on_uses_the_last_business_day_within_the_gap():
    dates, values = ["1985-02-25", "1985-02-27"], [1.0, 2.0]
    assert cr.rate_on(dates, values, "1985-02-26") == 1.0
    assert cr.rate_on(dates, values, "1985-03-01") == 2.0
    assert cr.rate_on(dates, values, "1985-03-10") is None  # more than 5 days
    assert cr.rate_on(dates, values, "1985-02-23") == 1.0  # before the series: its first day, 2 days later
    assert cr.rate_on(["1985-02-01"], [3.0], "1985-02-17", monthly=True) == 3.0
    assert cr.rate_on(["1985-02-01"], [3.0], "1985-03-17", monthly=True) is None


def test_pct_change_is_the_currency_s_value_against_usd():
    assert round(cr.pct_change(100, 80), 6) == 25.0  # 100 -> 80 per USD: the currency gained 25%
    assert round(cr.pct_change(888, 1776), 6) == -50.0


def test_weekly_reads_the_bundled_series_with_the_mark_euro_chain():
    h = {
        "start": "1998-12-25", "count": 3, "stepDays": 7,
        "currencies": [{"slot": "EUR", "first": 0, "chainFactor": 2.0, "values": [1.7, 1.7, 1.8],
                        "segments": [{"code": "DEM", "fromIndex": 0}, {"code": "EUR", "fromIndex": 2}]}],
    }
    w = cr.Weekly(h)
    assert w.iso(2) == "1999-01-08"
    assert w.rate("DEM", 0) == 1.7 and w.rate("EUR", 0) is None
    assert w.rate("EUR", 2) == 0.9  # DEM-equivalent / chain factor
    assert w.index_on_or_after("1999-01-02") == 2


def test_featured_review_targets_point_at_the_current_text():
    review = json.loads((ROOT / "content" / "featured-review.json").read_text(encoding="utf-8"))["items"]
    history = json.loads((ROOT / "content" / "history.json").read_text(encoding="utf-8"))
    sources = json.loads((ROOT / "content" / "sources.json").read_text(encoding="utf-8"))["sources"]
    targets = [it for it in review if it["target"].startswith("history:")]
    assert len(targets) >= 30
    for it in targets:
        assert rf.history_text(history, it["target"]) == it["text"], it["target"]
    for it in review:
        assert it["evidence"], it["target"]
        for i in it["evidence"]:
            assert "source" not in i or i["source"] in sources, it["target"]
    # Every person on a featured portal has a reviewed involvement.
    for e in history["events"]:
        for p in e["people"]:
            assert any(it["target"] == f"history:{e['id']}:people:{p['person']}" for it in review), p["person"]
