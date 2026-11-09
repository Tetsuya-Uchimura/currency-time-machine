/**
 * Tests for the three-band layout (config BANDS) and the eras shown between
 * events. Run: node --test tests/layout.test.ts   (Node >= 22.18 strips TS types)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BANDS, bandPitch, bandSpanDeg, HAND_PANEL, VOICES } from '../src/config.ts';
import { eraAt, ERAS } from '../src/data/eras.ts';

const deg = (r: number) => (r * 180) / Math.PI;

test('three bands stacked top to bottom without overlapping, seen from the seat', () => {
  const e = bandSpanDeg(BANDS.events);
  const c = bandSpanDeg(BANDS.chart);
  const m = bandSpanDeg(BANDS.map);
  console.log(`events ${e.top.toFixed(1)}..${e.bottom.toFixed(1)}  chart ${c.top.toFixed(1)}..${c.bottom.toFixed(1)}  map ${m.top.toFixed(1)}..${m.bottom.toFixed(1)} deg`);
  assert.ok(e.bottom > c.top, 'events above the chart');
  assert.ok(c.bottom > m.top, 'chart above the map');
  // All three within a glance and a slight nod (no turning, no craning).
  assert.ok(e.top < 30 && m.bottom > -40, `${e.top.toFixed(1)}..${m.bottom.toFixed(1)} deg`);
  assert.ok(e.top - m.bottom < 66);
  for (const b of Object.values(BANDS)) {
    assert.ok(deg(Math.atan2(b.width / 2, b.z)) < 36, 'readable without turning the head');
  }
});

test('depth: events farthest, the map nearest (gentle parallax), all well beyond the hands', () => {
  assert.ok(BANDS.events.z > BANDS.chart.z && BANDS.chart.z > BANDS.map.z);
  assert.ok(BANDS.map.z > 0.9, 'at a comfortable reading distance');
});

test('each band faces the head; the map is tilted back like a table', () => {
  assert.ok(Math.abs(deg(bandPitch(BANDS.chart)) - deg(Math.atan2(BANDS.chart.y, BANDS.chart.z))) < 1e-9);
  assert.ok(deg(bandPitch(BANDS.events)) > 0, 'the top band leans toward the user');
  assert.ok(deg(bandPitch(BANDS.map)) < deg(Math.atan2(BANDS.map.y, BANDS.map.z)), 'the map leans back');
});

test('the hand panel stays below the map, so it never hides it', () => {
  const panelTop = deg(Math.atan2(HAND_PANEL.y + 0.1, HAND_PANEL.z - 0.08)); // (the taller Year Journey panel)
  assert.ok(panelTop < bandSpanDeg(BANDS.map).bottom, `${panelTop.toFixed(1)} deg`);
});

test('voices sit at eye level by the chart, spread west to east (never down at the map)', () => {
  assert.ok(Math.abs(deg(Math.atan2(VOICES.y, VOICES.radius))) < 5);
  assert.ok(VOICES.arcDeg >= 60 && VOICES.arcDeg <= 100);
});

test('eras: in order, and none starts before its event', () => {
  for (let i = 1; i < ERAS.length; i++) assert.ok(ERAS[i].from > ERAS[i - 1].from);
  assert.equal(eraAt('1960-01-01').name, 'Bretton Woods: fixed rates');
  assert.equal(eraAt('1971-08-14').name, 'Bretton Woods: fixed rates');
  assert.equal(eraAt('1971-08-15').name, 'After the gold link');
  assert.equal(eraAt('1985-09-22').name, 'Floating rates');
  assert.equal(eraAt('1998-12-31').name, 'Floating rates');
  assert.equal(eraAt('1999-01-01').name, 'Floating rates and the euro');
});
