"""
Build the world map used by the Interactive World Currency Map.

Source: Natural Earth 1:110m "land" and "admin 0 countries" (public domain,
https://www.naturalearthdata.com/about/terms-of-use/). The two GeoJSON files
are downloaded once into data-raw/map/ (gitignored); the app only ever loads
the small file written here, so no map service is called at runtime.

Projection: Equal Earth (Savric, Patterson and Jenny, 2018), an equal-area
projection, so no region looks bigger than it is. Latitudes are cropped to
LAT_MIN..LAT_MAX (no Antarctica, which has no currency here). The TypeScript
side (src/data/world-map.ts) uses the same formula and crop for the currency
markers, and a test checks that both agree.

Output: public/data/world-map.json
  aspect   width / height of the projected map
  coast    coastlines as polylines of normalized (u, v) points, u, v in 0..1
           (v = 0 south, v = 1 north)
  dots     a regular dot grid on land: u, v, region (0 = other land, k = the
           k-th code of `regions`); the shader tints a region's dots
  regions  ISO 3166 alpha-3 codes of the countries tied to a currency

Usage:  python scripts/build_map.py [--refresh]
Standard library only.
"""
from __future__ import annotations

import argparse
import json
import math
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data-raw" / "map"
OUT = ROOT / "public" / "data" / "world-map.json"
BASE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
USER_AGENT = "CurrencyTimeMachineBuild/0.1 (https://github.com/Tetsuya-Uchimura/currency-time-machine)"

LAT_MIN = -57.0
LAT_MAX = 80.0
# Dot grid: this many columns across the full width.
DOT_COLUMNS = 150

# Countries tied to a currency (see src/data/world-map.ts for the meaning):
# the nine slots' home countries, the United States, and the euro area members.
REGIONS = [
    "USA", "CAN", "GBR", "DEU", "CHE", "IND", "CHN", "KOR", "JPN", "AUS",
    # Euro area (Malta is too small for the 1:110m data).
    "AUT", "BEL", "FIN", "FRA", "IRL", "ITA", "LUX", "NLD", "PRT", "ESP",
    "GRC", "SVN", "CYP", "SVK", "EST", "LVA", "LTU", "HRV", "BGR",
]

# Equal Earth constants.
A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
M = math.sqrt(3) / 2


def equal_earth(lon: float, lat: float) -> tuple[float, float]:
    """Project degrees to Equal Earth (unit sphere)."""
    lam = math.radians(lon)
    th = math.asin(M * math.sin(math.radians(lat)))
    t2 = th * th
    t6 = t2 * t2 * t2
    x = lam * math.cos(th) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
    y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return x, y


def inverse_equal_earth(x: float, y: float) -> tuple[float, float] | None:
    """Degrees for an Equal Earth point (Newton iteration on the latitude)."""
    th = y
    for _ in range(12):
        t2 = th * th
        t6 = t2 * t2 * t2
        fy = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) - y
        fpy = A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)
        d = fy / fpy
        th -= d
        if abs(d) < 1e-10:
            break
    t2 = th * th
    t6 = t2 * t2 * t2
    s = math.sin(th) / M
    if abs(s) > 1:
        return None
    lam = M * x * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)) / math.cos(th)
    lon = math.degrees(lam)
    if abs(lon) > 180:
        return None
    return lon, math.degrees(math.asin(s))


X_MAX = equal_earth(180, 0)[0]
Y_MIN = equal_earth(0, LAT_MIN)[1]
Y_MAX = equal_earth(0, LAT_MAX)[1]


def normalize(x: float, y: float) -> tuple[float, float]:
    return (x + X_MAX) / (2 * X_MAX), (y - Y_MIN) / (Y_MAX - Y_MIN)


def fetch(name: str, refresh: bool) -> dict:
    path = RAW / f"{name}.geojson"
    if refresh or not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(BASE_URL + f"{name}.geojson", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as r:
            path.write_bytes(r.read())
    return json.loads(path.read_text(encoding="utf-8"))


def polygons(geom: dict) -> list[list[list[list[float]]]]:
    """A geometry as a list of polygons (each a list of rings)."""
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def ring_contains(ring: list[list[float]], lon: float, lat: float) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


class Shape:
    """Polygons with bounding boxes, for fast point-in-polygon tests."""

    def __init__(self, geom: dict):
        self.polys = []
        for poly in polygons(geom):
            xs = [p[0] for p in poly[0]]
            ys = [p[1] for p in poly[0]]
            self.polys.append(((min(xs), min(ys), max(xs), max(ys)), poly))

    def contains(self, lon: float, lat: float) -> bool:
        for (x0, y0, x1, y1), poly in self.polys:
            if lon < x0 or lon > x1 or lat < y0 or lat > y1:
                continue
            if ring_contains(poly[0], lon, lat) and not any(ring_contains(h, lon, lat) for h in poly[1:]):
                return True
        return False


def coastlines(land: dict) -> list[list[float]]:
    """Land outlines as normalized polylines, cut where they leave the crop or run along the date line."""
    lines: list[list[float]] = []
    for feat in land["features"]:
        for poly in polygons(feat["geometry"]):
            for ring in poly:
                cur: list[float] = []
                prev = None
                for lon, lat in ring:
                    ok = LAT_MIN <= lat <= LAT_MAX
                    seam = prev is not None and abs(lon) > 179.9 and abs(prev[0]) > 179.9
                    if not ok or seam:
                        if len(cur) >= 4:
                            lines.append(cur)
                        cur = []
                    if ok:
                        u, v = normalize(*equal_earth(lon, lat))
                        cur += [round(u, 4), round(v, 4)]
                    prev = (lon, lat)
                if len(cur) >= 4:
                    lines.append(cur)
    return lines


def dots(land: dict, countries: dict) -> list[float]:
    """A regular grid of dots on land, each tagged with its currency region."""
    land_shapes = [Shape(f["geometry"]) for f in land["features"]]
    by_code = {f["properties"]["ADM0_A3"]: f for f in countries["features"]}
    codes = [c for c in REGIONS if c in by_code]
    region_shapes = [(k + 1, Shape(by_code[c]["geometry"])) for k, c in enumerate(codes)]
    width = 2 * X_MAX
    step = width / DOT_COLUMNS
    rows = int((Y_MAX - Y_MIN) / step)
    out: list[float] = []
    for r in range(rows):
        y = Y_MIN + (r + 0.5) * step
        # Offset every other row: a hexagonal pattern reads as a finer grid.
        off = 0.5 * step if r % 2 else 0
        for c in range(DOT_COLUMNS):
            x = -X_MAX + (c + 0.25) * step + off
            ll = inverse_equal_earth(x, y)
            if ll is None:
                continue
            lon, lat = ll
            if not any(s.contains(lon, lat) for s in land_shapes):
                continue
            region = next((k for k, s in region_shapes if s.contains(lon, lat)), 0)
            u, v = normalize(x, y)
            out += [round(u, 4), round(v, 4), region]
    return out


def build(refresh: bool = False) -> dict:
    land = fetch("ne_110m_land", refresh)
    countries = fetch("ne_110m_admin_0_countries", refresh)
    found = {f["properties"]["ADM0_A3"] for f in countries["features"]}
    return {
        "source": "Natural Earth 1:110m land and admin-0 countries (public domain), naturalearthdata.com",
        "projection": "Equal Earth",
        "latMin": LAT_MIN,
        "latMax": LAT_MAX,
        "aspect": round((2 * X_MAX) / (Y_MAX - Y_MIN), 5),
        "regions": [c for c in REGIONS if c in found],
        "coast": coastlines(land),
        "dots": dots(land, countries),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--refresh", action="store_true", help="download the Natural Earth files again")
    args = ap.parse_args()
    data = build(args.refresh)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    n_dots = len(data["dots"]) // 3
    n_pts = sum(len(l) // 2 for l in data["coast"])
    print(f"wrote {OUT.relative_to(ROOT)}: {n_dots} dots, {len(data['coast'])} coastlines ({n_pts} points), "
          f"{OUT.stat().st_size // 1024} KB; regions {len(data['regions'])}/{len(REGIONS)}")


if __name__ == "__main__":
    main()
