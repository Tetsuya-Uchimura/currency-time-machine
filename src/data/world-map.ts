/**
 * Interactive World Currency Map: projection, where each currency sits, and
 * which countries it covers over time. Pure data and math (no runtime
 * imports), unit tested in tests/map.test.ts.
 *
 * The land itself comes from public/data/world-map.json, built from Natural
 * Earth (public domain) by scripts/build_map.py with the same Equal Earth
 * projection and the same latitude crop as here.
 *
 * A marker is a symbolic anchor for the currency's home (a country, or the
 * euro area); it does not mean the currency is traded only there.
 */

export const LAT_MIN = -57;
export const LAT_MAX = 80;

const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;

/** Equal Earth projection (unit sphere). */
export function equalEarth(lon: number, lat: number): [number, number] {
  const lam = (lon * Math.PI) / 180;
  const th = Math.asin(M * Math.sin((lat * Math.PI) / 180));
  const t2 = th * th;
  const t6 = t2 * t2 * t2;
  const x = (lam * Math.cos(th)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}

const X_MAX = equalEarth(180, 0)[0];
const Y_MIN = equalEarth(0, LAT_MIN)[1];
const Y_MAX = equalEarth(0, LAT_MAX)[1];

/** Width / height of the projected, cropped map. */
export const MAP_ASPECT = (2 * X_MAX) / (Y_MAX - Y_MIN);

/** Normalized map position: u 0..1 west to east, v 0..1 south to north. */
export function mapUV(lon: number, lat: number): { u: number; v: number } {
  const [x, y] = equalEarth(lon, lat);
  return { u: (x + X_MAX) / (2 * X_MAX), v: (y - Y_MIN) / (Y_MAX - Y_MIN) };
}

/** One name for a period: the label's second line ("Japan", "Euro area"). */
export interface Place {
  /** First day this name applies (ISO date). */
  from: string;
  name: string;
}

export interface MapCurrency {
  /** Slot id from config SLOTS, or 'USD' for the base currency. */
  id: string;
  /** Marker anchor (degrees). */
  lon: number;
  lat: number;
  /** Center of the label, in normalized map units: placed off the crowded areas, joined to the marker by a leader line. */
  label: { u: number; v: number };
  places: Place[];
}

/**
 * Anchors: the geographic middle of the country, except for the Deutsche
 * Mark / euro, anchored at Frankfurt am Main (seat of the Bundesbank, and of
 * the European Central Bank since 1998), and Switzerland at Bern.
 * Labels: Europe's three are fanned out over the sea and the north (GBP to
 * the North Atlantic, DEM/EUR to the north, CHF to the Atlantic off Iberia).
 */
export const MAP_CURRENCIES: MapCurrency[] = [
  { id: 'USD', lon: -98.6, lat: 39.8, label: { u: 0.12, v: 0.7 }, places: [{ from: '1900-01-01', name: 'United States' }] },
  { id: 'CAD', lon: -106, lat: 56, label: { u: 0.15, v: 0.93 }, places: [{ from: '1900-01-01', name: 'Canada' }] },
  { id: 'GBP', lon: -1.5, lat: 52.5, label: { u: 0.375, v: 0.93 }, places: [{ from: '1900-01-01', name: 'United Kingdom' }] },
  {
    id: 'EUR',
    lon: 8.68,
    lat: 50.11,
    label: { u: 0.6, v: 0.95 },
    places: [
      { from: '1900-01-01', name: 'West Germany' },
      // German monetary union: the Deutsche Mark became East Germany's currency too.
      { from: '1990-07-01', name: 'Germany' },
      { from: '1999-01-01', name: 'Euro area' },
    ],
  },
  { id: 'CHF', lon: 7.45, lat: 46.95, label: { u: 0.415, v: 0.765 }, places: [{ from: '1900-01-01', name: 'Switzerland' }] },
  { id: 'INR', lon: 78.9, lat: 22, label: { u: 0.64, v: 0.5 }, places: [{ from: '1900-01-01', name: 'India' }] },
  { id: 'CNY', lon: 104, lat: 35, label: { u: 0.73, v: 0.885 }, places: [{ from: '1900-01-01', name: 'China' }] },
  { id: 'KRW', lon: 127.8, lat: 36.4, label: { u: 0.8, v: 0.615 }, places: [{ from: '1900-01-01', name: 'South Korea' }] },
  { id: 'JPY', lon: 138.5, lat: 36.5, label: { u: 0.92, v: 0.84 }, places: [{ from: '1900-01-01', name: 'Japan' }] },
  { id: 'AUD', lon: 134, lat: -25, label: { u: 0.93, v: 0.33 }, places: [{ from: '1900-01-01', name: 'Australia' }] },
];

/**
 * Euro area members and the day each adopted the euro (Malta, 2008, is too
 * small for the map data). Sources: European Central Bank, "Our currency:
 * the euro area"; Bulgaria: Council of the EU decision of 8 July 2025.
 */
export const EURO_AREA: { iso: string; from: string }[] = [
  ...['AUT', 'BEL', 'FIN', 'FRA', 'DEU', 'IRL', 'ITA', 'LUX', 'NLD', 'PRT', 'ESP'].map((iso) => ({ iso, from: '1999-01-01' })),
  { iso: 'GRC', from: '2001-01-01' },
  { iso: 'SVN', from: '2007-01-01' },
  { iso: 'CYP', from: '2008-01-01' },
  { iso: 'SVK', from: '2009-01-01' },
  { iso: 'EST', from: '2011-01-01' },
  { iso: 'LVA', from: '2014-01-01' },
  { iso: 'LTU', from: '2015-01-01' },
  { iso: 'HRV', from: '2023-01-01' },
  { iso: 'BGR', from: '2026-01-01' },
];

/** Home country of each currency (the euro's is handled by EURO_AREA). */
const HOME: Record<string, string> = {
  USD: 'USA',
  CAD: 'CAN',
  GBP: 'GBR',
  CHF: 'CHE',
  INR: 'IND',
  CNY: 'CHN',
  KRW: 'KOR',
  JPY: 'JPN',
  AUD: 'AUS',
};

/** The name of a currency's home on a date. */
export function placeAt(c: MapCurrency, date: string): string {
  let name = c.places[0].name;
  for (const p of c.places) if (date >= p.from) name = p.name;
  return name;
}

/**
 * Which currency each map region (country) belongs to on a date: a currency
 * id, or '' (not shown). Germany carries the Deutsche Mark only from the
 * monetary union of 1 July 1990 (before that the map cannot separate West
 * from East Germany, so no country is tinted for the Mark).
 */
export function regionOwner(iso: string, date: string): string {
  for (const [id, home] of Object.entries(HOME)) if (home === iso) return id;
  const euro = EURO_AREA.find((m) => m.iso === iso);
  if (euro && date >= euro.from) return 'EUR';
  if (iso === 'DEU' && date >= '1990-07-01') return 'EUR';
  return '';
}

/** Axis-aligned rectangle in normalized map units. */
export interface Rect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** A label's rectangle, given its size in normalized units. */
export function labelRect(c: MapCurrency, w: number, h: number): Rect {
  return { u0: c.label.u - w / 2, v0: c.label.v - h / 2, u1: c.label.u + w / 2, v1: c.label.v + h / 2 };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;
}

export function contains(r: Rect, u: number, v: number): boolean {
  return u >= r.u0 && u <= r.u1 && v >= r.v0 && v <= r.v1;
}

/** Where a leader line from (u, v) meets the rectangle's edge (the nearest point). */
export function nearestOnRect(r: Rect, u: number, v: number): { u: number; v: number } {
  return { u: Math.min(r.u1, Math.max(r.u0, u)), v: Math.min(r.v1, Math.max(r.v0, v)) };
}

/** Shape of public/data/world-map.json. */
export interface WorldMapFile {
  source: string;
  projection: string;
  latMin: number;
  latMax: number;
  aspect: number;
  regions: string[];
  coast: number[][];
  dots: number[];
}
