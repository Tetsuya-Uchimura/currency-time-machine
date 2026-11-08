"""Tests for scripts/build_history.py.

Run:  python -m pytest -q

The first group tests the pure transformation helpers with small synthetic
series (no network). The last group checks the generated bundle in
public/data/ and is skipped if it has not been built yet.
"""

from __future__ import annotations

import datetime as dt
import json
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_history as bh  # noqa: E402

D = dt.date


# --- grid & sampling --------------------------------------------------------

def test_grid_starts_on_friday_and_steps_weekly():
    grid = bh.make_grid(D(1948, 6, 21), D(1948, 7, 31))  # 1948-06-21 is a Monday
    assert grid[0] == D(1948, 6, 25)
    assert all(g.weekday() == 4 for g in grid)
    assert all((b - a).days == 7 for a, b in zip(grid, grid[1:]))
    assert grid[-1] <= D(1948, 7, 31)


def test_sample_takes_latest_observation_not_after_grid_date():
    series = {D(2000, 1, 3): 1.0, D(2000, 1, 6): 2.0, D(2000, 1, 10): 3.0}
    grid = [D(2000, 1, 7), D(2000, 1, 14)]
    assert bh.sample_at(series, grid) == [2.0, 3.0]


def test_sample_returns_none_before_start_and_when_stale():
    series = {D(2000, 1, 3): 1.0}
    grid = [D(1999, 12, 31), D(2000, 1, 7), D(2000, 2, 4)]
    assert bh.sample_at(series, grid, max_staleness_days=10) == [None, 1.0, None]


def test_year_chunks_cover_range_without_overlap():
    chunks = bh.year_chunks(D(1948, 1, 1), D(2026, 11, 9), years=5)
    assert chunks[0] == (D(1948, 1, 1), D(1949, 12, 31))
    assert chunks[-1][1] == D(2026, 11, 9)
    for (_, b), (a2, _) in zip(chunks, chunks[1:]):
        assert a2 == b + dt.timedelta(days=1)


# --- euro handover ----------------------------------------------------------

def test_chain_slot_is_continuous_across_switch():
    switch = D(1999, 1, 1)
    dem = {D(1998, 12, 30): 1.67, D(1999, 1, 1): 1.68, D(1999, 1, 4): 1.66}
    eur = {D(1999, 1, 1): 1.68 / 1.95583, D(1999, 1, 4): 0.85}
    joined, factor = bh.chain_slot(dem, eur, switch)
    assert factor == pytest.approx(1.95583)
    # Before the switch we keep DEM; from the switch we use EUR in DEM units.
    assert joined[D(1998, 12, 30)] == 1.67
    assert joined[D(1999, 1, 1)] == pytest.approx(1.68)
    assert joined[D(1999, 1, 4)] == pytest.approx(0.85 * 1.95583)


def test_chain_factor_requires_overlap():
    with pytest.raises(ValueError):
        bh.chain_factor({D(1998, 1, 1): 1.0}, {D(1999, 1, 5): 1.0}, D(1999, 1, 1))


# --- gaps, artefacts, rounding ----------------------------------------------

def test_fill_interior_gaps_strips_leading_and_carries_forward():
    first, dense = bh.fill_interior_gaps([None, None, 1.0, None, 2.0])
    assert first == 2
    assert dense == [1.0, 1.0, 2.0]


def test_fill_interior_gaps_rejects_long_holes():
    with pytest.raises(ValueError):
        bh.fill_interior_gaps([1.0] + [None] * 5 + [1.0], max_gap=4)


def test_big_moves_flags_redenomination_but_not_crises():
    # French franc 1960: 100 old francs -> 1 new franc (an artefact, not a market move).
    assert bh.big_moves([490.8, 4.907]) != []
    # Korean won, Dec 1997: ~25% in one week is a genuine (and kept) move.
    assert bh.big_moves([1200.0, 1500.0]) == []


def test_round_sig():
    assert bh.round_sig(357.6345) == 357.635
    assert bh.round_sig(0.000123456789) == 0.000123457
    assert bh.round_sig(0) == 0.0


# --- parsing & today snapshot ------------------------------------------------

def test_parse_records_skips_identity_and_bad_rows():
    recs = [
        {"date": "2020-01-01", "base": "USD", "quote": "USD", "rate": 1},
        {"date": "2020-01-01", "base": "USD", "quote": "JPY", "rate": 108.6},
        {"date": "2020-01-01", "base": "USD", "quote": "GBP", "rate": None},
        {"date": "2020-01-01", "base": "EUR", "quote": "GBP", "rate": 0.85},
    ]
    assert bh.parse_records(recs) == {"JPY": {D(2020, 1, 1): 108.6}}


def test_latest_and_previous_ignores_weekend_reblends():
    series = {
        D(2026, 11, 5): 157.0,  # Thu
        D(2026, 11, 6): 158.2,  # Fri
        D(2026, 11, 7): 158.21,  # Sat (re-blend noise)
        D(2026, 11, 8): 158.19,  # Sun (re-blend noise)
    }
    info = bh.latest_and_previous(series)
    assert info == {"date": "2026-11-06", "rate": 158.2, "prev": 157.0, "prevDate": "2026-11-05"}


def test_latest_and_previous_walks_back_over_holiday_carry():
    series = {
        D(2026, 12, 23): 150.0,  # Wed
        D(2026, 12, 24): 151.0,  # Thu
        D(2026, 12, 25): 151.0,  # Fri (holiday, carried)
    }
    info = bh.latest_and_previous(series)
    assert info["prev"] == 150.0 and info["prevDate"] == "2026-12-23"


def test_latest_and_previous_handles_flat_or_empty_series():
    assert bh.latest_and_previous({}) is None
    flat = bh.latest_and_previous({D(2026, 1, 1): 1.0, D(2026, 1, 2): 1.0})
    assert flat["prev"] == flat["rate"] == 1.0


# --- generated bundle (skipped until built) ---------------------------------

HISTORY = ROOT / "public" / "data" / "history.json"
SNAPSHOT = ROOT / "public" / "data" / "snapshot.json"
needs_bundle = pytest.mark.skipif(not HISTORY.exists(), reason="run scripts/build_history.py first")


@pytest.fixture(scope="module")
def history():
    return json.loads(HISTORY.read_text(encoding="utf-8"))


def _series(history, slot):
    c = next(c for c in history["currencies"] if c["slot"] == slot)
    return c


def _value_at(history, slot, date: dt.date):
    c = _series(history, slot)
    idx = (date - D.fromisoformat(history["start"])).days // history["stepDays"]
    return c["values"][idx - c["first"]]


@needs_bundle
def test_bundle_shape_and_size(history):
    assert history["attribution"] == "Exchange rate data: Frankfurter (frankfurter.dev)"
    assert history["base"] == "USD"
    assert history["start"] == "1948-06-25"
    assert [c["slot"] for c in history["currencies"]] == list(bh.SLOTS)
    for c in history["currencies"]:
        assert c["first"] + len(c["values"]) == history["count"]
        assert all(v > 0 for v in c["values"])
    assert HISTORY.stat().st_size < 2 * 1024 * 1024  # "a few MB" budget, with margin


@needs_bundle
def test_bundle_world_fills_in_order(history):
    """Orbs light up when their data begins: DEM first, the yen in late 1969."""
    start = D.fromisoformat(history["start"])
    first_date = {
        c["slot"]: start + dt.timedelta(days=7 * c["first"]) for c in history["currencies"]
    }
    assert first_date["EUR"] == start  # carried by the Deutsche Mark
    assert D(1969, 11, 25) <= first_date["JPY"] <= D(1969, 12, 12)
    assert first_date["CNY"].year == first_date["KRW"].year == 1981


@needs_bundle
def test_bundle_reproduces_known_history(history):
    # Fixed-rate era: sterling at $2.80 until the 1967 devaluation, then $2.40.
    assert 1 / _value_at(history, "GBP", D(1960, 6, 3)) == pytest.approx(2.80, rel=0.01)
    assert 1 / _value_at(history, "GBP", D(1968, 6, 7)) == pytest.approx(2.40, rel=0.01)
    # The yen near its 360 peg when it appears, then Plaza and the 2022 slide.
    assert _value_at(history, "JPY", D(1970, 1, 9)) == pytest.approx(358, rel=0.01)
    assert _value_at(history, "JPY", D(1987, 12, 4)) < 140
    assert _value_at(history, "JPY", D(2022, 10, 21)) > 145
    # Swiss franc shock: >10% stronger within a week in January 2015.
    before = _value_at(history, "CHF", D(2015, 1, 9))
    after = _value_at(history, "CHF", D(2015, 1, 23))
    assert after / before < 0.9
    # Asian crisis: the won loses over 35% between mid and end 1997.
    assert _value_at(history, "KRW", D(1997, 12, 26)) / _value_at(history, "KRW", D(1997, 6, 6)) > 1.35


@needs_bundle
def test_bundle_euro_slot_has_no_jump_at_handover(history):
    a = _value_at(history, "EUR", D(1998, 12, 25))
    b = _value_at(history, "EUR", D(1999, 1, 8))
    assert abs(math.log(b / a)) < 0.03
    c = _series(history, "EUR")
    assert c["chainFactor"] == pytest.approx(bh.DEM_PER_EUR_OFFICIAL, rel=0.005)
    assert [s["code"] for s in c["segments"]] == ["DEM", "EUR"]


@needs_bundle
def test_snapshot_has_all_today_codes():
    snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    assert snap["base"] == "USD"
    assert set(snap["rates"]) == set(bh.TODAY_CODES)
    for info in snap["rates"].values():
        assert info["rate"] > 0 and info["prev"] > 0
        assert info["prevDate"] <= info["date"]
