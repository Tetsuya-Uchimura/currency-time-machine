"""Tests for scripts/build_map.py (projection helpers and the committed output)."""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_map  # noqa: E402


def test_equal_earth_round_trip():
    for lon, lat in [(0, 0), (-98.6, 39.8), (138.5, 36.5), (134, -25), (-70, -55), (179, 79)]:
        x, y = build_map.equal_earth(lon, lat)
        back = build_map.inverse_equal_earth(x, y)
        assert back is not None
        assert math.isclose(back[0], lon, abs_tol=1e-6)
        assert math.isclose(back[1], lat, abs_tol=1e-6)


def test_inverse_rejects_points_outside_the_globe():
    assert build_map.inverse_equal_earth(build_map.X_MAX * 1.01, 0) is None


def test_ring_contains_with_a_hole():
    square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
    hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]
    shape = build_map.Shape({"type": "Polygon", "coordinates": [square, hole]})
    assert shape.contains(2, 2)
    assert not shape.contains(5, 5)
    assert not shape.contains(12, 5)


def test_committed_map_file():
    data = json.loads((ROOT / "public" / "data" / "world-map.json").read_text(encoding="utf-8"))
    assert data["projection"] == "Equal Earth"
    assert "public domain" in data["source"]
    assert data["latMin"] == build_map.LAT_MIN and data["latMax"] == build_map.LAT_MAX
    dots = data["dots"]
    assert len(dots) % 3 == 0 and len(dots) // 3 > 1500
    assert all(0 <= dots[k] <= 1 and 0 <= dots[k + 1] <= 1 for k in range(0, len(dots), 3))
    assert max(dots[2::3]) <= len(data["regions"])
    # Every currency home has dots of its own.
    for iso in ["USA", "CAN", "GBR", "DEU", "CHE", "IND", "CHN", "KOR", "JPN", "AUS"]:
        k = data["regions"].index(iso) + 1
        assert k in dots[2::3], iso
    assert all(len(line) >= 4 and len(line) % 2 == 0 for line in data["coast"])
    assert (ROOT / "public" / "data" / "world-map.json").stat().st_size < 200_000
