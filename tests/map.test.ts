/**
 * Tests for the Interactive World Currency Map (src/data/world-map.ts and
 * public/data/world-map.json, built by scripts/build_map.py).
 * Run: node --test tests/map.test.ts   (Node >= 22.18 strips TS types)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BANDS, MAP, SLOTS } from '../src/config.ts';
import { Timeline, type HistoryFile } from '../src/data/timeline.ts';
import {
  contains,
  EURO_AREA,
  labelRect,
  MAP_ASPECT,
  MAP_CURRENCIES,
  mapUV,
  overlaps,
  placeAt,
  regionOwner,
  type WorldMapFile,
} from '../src/data/world-map.ts';

const map = JSON.parse(readFileSync(new URL('../public/data/world-map.json', import.meta.url), 'utf8')) as WorldMapFile;
const history = JSON.parse(readFileSync(new URL('../public/data/history.json', import.meta.url), 'utf8')) as HistoryFile;
const timeline = new Timeline(
  history,
  SLOTS.map((s) => s.slot),
);

/** The country each marker must sit in. */
const HOME: Record<string, string> = {
  USD: 'USA',
  CAD: 'CAN',
  GBP: 'GBR',
  EUR: 'DEU',
  CHF: 'CHE',
  INR: 'IND',
  CNY: 'CHN',
  KRW: 'KOR',
  JPY: 'JPN',
  AUD: 'AUS',
};

/** Region code of the land dot nearest to (u, v), and its distance. */
function nearestDot(u: number, v: number): { iso: string; d: number } {
  let best = { iso: '', d: Infinity };
  for (let k = 0; k < map.dots.length; k += 3) {
    const d = Math.hypot((map.dots[k] - u) * MAP_ASPECT, map.dots[k + 1] - v);
    if (d < best.d) best = { iso: map.dots[k + 2] ? map.regions[map.dots[k + 2] - 1] : '', d };
  }
  return best;
}

test('the map file and the app use the same projection and crop', () => {
  assert.equal(map.projection, 'Equal Earth');
  assert.ok(Math.abs(map.aspect - MAP_ASPECT) < 1e-4, `${map.aspect} vs ${MAP_ASPECT}`);
  assert.ok(Math.abs(BANDS.map.width / BANDS.map.height - MAP_ASPECT) / MAP_ASPECT < 0.01, 'the band keeps the map’s shape');
  assert.match(map.source, /Natural Earth/);
});

test('every currency sits in its own country (nine slots plus the US dollar)', () => {
  assert.deepEqual(
    MAP_CURRENCIES.map((c) => c.id).sort(),
    [...SLOTS.map((s) => s.slot), 'USD'].sort(),
  );
  for (const c of MAP_CURRENCIES) {
    const { u, v } = mapUV(c.lon, c.lat);
    assert.ok(u > 0 && u < 1 && v > 0 && v < 1, `${c.id} on the map`);
    const near = nearestDot(u, v);
    assert.equal(near.iso, HOME[c.id], `${c.id} marker is in ${HOME[c.id]} (nearest land is ${near.iso})`);
    assert.ok(near.d < 0.02, `${c.id} marker is on land`);
  }
  // West to east, like the voices.
  const order = SLOTS.map((s) => mapUV(MAP_CURRENCIES.find((c) => c.id === s.slot)!.lon, 0).u);
  assert.ok(order.every((u, i) => i === 0 || u >= order[i - 1] - 0.03), 'slots run west to east');
});

test('USD is the base: its own marker, never a line or a solo target', () => {
  const usd = MAP_CURRENCIES.find((c) => c.id === 'USD')!;
  assert.ok(!SLOTS.some((s) => s.slot === 'USD'));
  assert.equal(placeAt(usd, '2000-01-01'), 'United States');
});

test('Deutsche Mark to euro: names, codes and countries follow the history', () => {
  const eur = MAP_CURRENCIES.find((c) => c.id === 'EUR')!;
  assert.equal(placeAt(eur, '1985-09-22'), 'West Germany');
  assert.equal(placeAt(eur, '1995-01-01'), 'Germany');
  assert.equal(placeAt(eur, '1998-12-31'), 'Germany');
  assert.equal(placeAt(eur, '1999-01-01'), 'Euro area');
  const k = SLOTS.findIndex((s) => s.slot === 'EUR');
  assert.equal(timeline.codeAt(k, timeline.indexOf('1998-12-25')), 'DEM');
  assert.equal(timeline.codeAt(k, timeline.indexOf('1999-01-08')), 'EUR');
  // Countries: no tint for the Mark before German monetary union (the map
  // cannot split West from East Germany); the euro area grows member by member.
  assert.equal(regionOwner('DEU', '1985-09-22'), '');
  assert.equal(regionOwner('DEU', '1990-07-01'), 'EUR');
  assert.equal(regionOwner('FRA', '1998-12-31'), '');
  assert.equal(regionOwner('FRA', '1999-01-01'), 'EUR');
  assert.equal(regionOwner('GRC', '2000-06-01'), '');
  assert.equal(regionOwner('GRC', '2001-01-01'), 'EUR');
  assert.equal(regionOwner('HRV', '2023-01-01'), 'EUR');
  assert.equal(regionOwner('BGR', '2025-12-31'), '');
  assert.equal(regionOwner('BGR', '2026-01-01'), 'EUR');
  assert.equal(regionOwner('GBR', '2010-01-01'), 'GBP', 'the UK never joined');
  assert.equal(regionOwner('CHE', '2010-01-01'), 'CHF');
  // Every member is on the map (Malta is too small for the 1:110m data).
  for (const m of EURO_AREA) assert.ok(map.regions.includes(m.iso), m.iso);
});

test('labels never overlap, stay on the map, and never cover a marker (Europe included)', () => {
  const W = BANDS.map.width;
  const H = BANDS.map.height;
  const rects = MAP_CURRENCIES.map((c) => ({
    id: c.id,
    r: labelRect(c, (c.id === 'USD' ? MAP.usdLabelWidth : MAP.labelWidth) / W, MAP.labelHeight / H),
  }));
  for (let a = 0; a < rects.length; a++) {
    const ra = rects[a].r;
    assert.ok(ra.u0 >= 0 && ra.u1 <= 1 && ra.v0 >= 0 && ra.v1 <= 1, `${rects[a].id} label inside the map`);
    for (let b = a + 1; b < rects.length; b++) {
      assert.ok(!overlaps(ra, rects[b].r), `${rects[a].id} and ${rects[b].id} labels overlap`);
    }
    for (const c of MAP_CURRENCIES) {
      const { u, v } = mapUV(c.lon, c.lat);
      assert.ok(!contains(ra, u, v), `${rects[a].id} label covers the ${c.id} marker`);
    }
  }
  // The markers themselves stay at their true places: Europe's three are close together.
  const eu = ['GBP', 'EUR', 'CHF'].map((id) => MAP_CURRENCIES.find((c) => c.id === id)!).map((c) => mapUV(c.lon, c.lat));
  assert.ok(Math.hypot(eu[0].u - eu[1].u, eu[0].v - eu[1].v) < 0.05);
});
