/**
 * Tests for the light-trail time-series math and the note/light sync queue.
 * Run: node --test tests/trails.test.ts   (Node >= 22.18 strips TS types)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { NoteQueue } from '../src/audio/note-queue.ts';
import { Timeline, type HistoryFile } from '../src/data/timeline.ts';
import {
  compactTrailLength,
  createSamples,
  interpByAge,
  maxTrailPoints,
  sampleTrail,
  TrailMorph,
  valueAt,
  windowChange,
  zoomTarget,
} from '../src/visual/trail-sampling.ts';

const W = 52;
const SLOT_ORDER = ['CAD', 'GBP', 'EUR', 'CHF', 'INR', 'CNY', 'KRW', 'JPY', 'AUD'];
const history = JSON.parse(readFileSync(new URL('../public/data/history.json', import.meta.url), 'utf8')) as HistoryFile;
const timeline = new Timeline(history, SLOT_ORDER);
const slot = (code: string) => timeline.slots[SLOT_ORDER.indexOf(code)];

/** A synthetic series: zeros before week 10, then a ramp with a kink. */
function synthetic(): Float32Array {
  const a = new Float32Array(200);
  for (let t = 10; t < 200; t++) a[t] = t < 100 ? (t - 10) * 0.01 : 0.9 - (t - 100) * 0.02;
  return a;
}

test('the window always spans exactly the same number of weeks', () => {
  const s = createSamples(W);
  for (const head of [62, 62.25, 63.5, 99.999, 150]) {
    sampleTrail(synthetic(), 10, head, W, s);
    assert.equal(s.t[0], head - W, 'left end is head - window');
    assert.equal(s.t[s.count - 1], head, 'right end is the head');
    assert.equal(s.age[0], 1);
    assert.equal(s.age[s.count - 1], 0);
    assert.ok(s.count <= maxTrailPoints(W));
  }
});

test('the window does not depend on playback speed or frame rate', () => {
  // Reaching the same head in big or tiny steps gives identical samples.
  const a = createSamples(W);
  const b = createSamples(W);
  const series = synthetic();
  sampleTrail(series, 10, 123.4, W, a);
  for (let head = 80; head < 123.4; head += 0.37) sampleTrail(series, 10, head, W, b);
  sampleTrail(series, 10, 123.4, W, b);
  assert.deepEqual([...a.value.slice(0, a.count)], [...b.value.slice(0, b.count)]);
  assert.deepEqual([...a.t.slice(0, a.count)], [...b.t.slice(0, b.count)]);
});

test('interior vertices sit exactly on the weekly data', () => {
  const s = createSamples(W);
  const jpy = slot('JPY');
  const head = timeline.indexOf('1986-03-14') + 0.4;
  sampleTrail(jpy.strength, jpy.first, head, W, s);
  for (let k = 1; k < s.count - 1; k++) {
    assert.ok(Number.isInteger(s.t[k]), 'interior vertex on a whole week');
    assert.equal(s.value[k], jpy.strength[s.t[k]]);
  }
  // The ends are linear between their two neighboring weeks.
  const i = Math.floor(head);
  const expect = jpy.strength[i] + (jpy.strength[i + 1] - jpy.strength[i]) * (head - i);
  assert.ok(Math.abs(s.value[s.count - 1] - expect) < 1e-6);
});

test('the shape scrolls rigidly: the same week keeps the same value', () => {
  const a = createSamples(W);
  const b = createSamples(W);
  const krw = slot('KRW');
  const head = timeline.indexOf('1998-01-02');
  sampleTrail(krw.strength, krw.first, head, W, a);
  sampleTrail(krw.strength, krw.first, head + 0.6, W, b);
  const byWeek = new Map<number, number>();
  for (let k = 1; k < a.count - 1; k++) byWeek.set(a.t[k], a.value[k]);
  let shared = 0;
  for (let k = 1; k < b.count - 1; k++) {
    if (byWeek.has(b.t[k])) {
      assert.equal(b.value[k], byWeek.get(b.t[k]));
      shared++;
    }
  }
  assert.ok(shared >= W - 2);
});

test('no line is drawn before a currency has data', () => {
  const s = createSamples(W);
  const series = synthetic();
  // Head before the first week: nothing valid at all.
  sampleTrail(series, 10, 5, W, s);
  assert.equal([...s.valid.slice(0, s.count)].filter(Boolean).length, 0);
  // Head shortly after the first week: only weeks >= first are valid,
  // and invalid vertices collapse onto the first week (zero length).
  sampleTrail(series, 10, 30.5, W, s);
  for (let k = 0; k < s.count; k++) {
    if (s.valid[k]) assert.ok(s.t[k] >= 10);
    else {
      assert.equal(s.t[k], 10);
      assert.equal(s.value[k], series[10]);
    }
  }
  assert.equal(s.valid[s.count - 1], 1);
  // Real data: the won before 1981.
  const krw = slot('KRW');
  sampleTrail(krw.strength, krw.first, timeline.indexOf('1979-06-01'), W, s);
  assert.equal([...s.valid.slice(0, s.count)].filter(Boolean).length, 0);
});

test('a jump samples the target time directly (no leftovers from before)', () => {
  const a = createSamples(W);
  const fresh = createSamples(W);
  const gbp = slot('GBP');
  sampleTrail(gbp.strength, gbp.first, timeline.indexOf('1975-01-03'), W, a);
  const target = timeline.indexOf('2008-01-04');
  sampleTrail(gbp.strength, gbp.first, target, W, a);
  sampleTrail(gbp.strength, gbp.first, target, W, fresh);
  assert.deepEqual([...a.value.slice(0, a.count)], [...fresh.value.slice(0, fresh.count)]);
});

test('today tail: straight line between the last week and the latest rate', () => {
  const series = new Float32Array([0, 0.1, 0.2, 0.3]);
  const tail = { index: 3.5, value: 0.5 };
  assert.equal(valueAt(series, 3, tail), series[3]);
  assert.ok(Math.abs(valueAt(series, 3.25, tail) - 0.4) < 1e-6);
  assert.equal(valueAt(series, 3.5, tail), 0.5);
  assert.equal(valueAt(series, 2, tail), series[2]); // history untouched
  // A latest rate dated on the last week replaces that week's value.
  const same = { index: 3, value: 0.35 };
  assert.ok(Math.abs(valueAt(series, 3, same) - 0.35) < 1e-6);
  assert.ok(Math.abs(valueAt(series, 2.5, same) - 0.275) < 1e-6);
  // The trail's head equals the latest rate, so the orb and trail agree.
  const s = createSamples(W);
  sampleTrail(series, 0, 3.5, W, s, tail);
  assert.equal(s.value[s.count - 1], 0.5);
});

test('window change and auto-zoom are computed from real values', () => {
  const s = createSamples(W);
  const krw = slot('KRW');
  // The 1997 crisis: the won lost a large part of its value within a year.
  sampleTrail(krw.strength, krw.first, timeline.indexOf('1998-01-02'), W, s);
  const w = windowChange(s)!;
  assert.ok(w.pct < -40, `won fell ${w.pct.toFixed(1)}%`);
  const z = zoomTarget(s, 0.012)!;
  assert.ok(z.half > 0.25);
  // Quiet fixed-rate era: the zoom floor stops noise being blown up.
  const chf = slot('CHF');
  sampleTrail(chf.strength, chf.first, timeline.indexOf('1960-01-01'), W, s);
  assert.equal(zoomTarget(s, 0.012)!.half, 0.012);
});

test('compact trails stop before the neighboring orb', () => {
  const radius = 0.6;
  const arcDeg = 90;
  const n = 9;
  const orb = 0.032;
  const L = compactTrailLength(radius, arcDeg, n, orb, 0.012);
  const step = (arcDeg * Math.PI) / 180 / (n - 1);
  const chord = 2 * radius * Math.sin(step / 2);
  assert.ok(L > 0.05, `long enough to read (${L.toFixed(3)} m)`);
  assert.ok(L + orb + 0.012 <= chord + 1e-12, 'never reaches the next orb');
});

test('seek morph starts on the old curve and settles on the new one', () => {
  const m = new TrailMorph(33, 0.35);
  const age = new Float32Array([1, 0.5, 0]);
  const oldY = new Float32Array([0.1, 0.1, 0.1]);
  m.capture(3, age, oldY, new Float32Array([1, 1, 1]));
  const y = new Float32Array([0.3, 0.2, 0.5]);
  const vis = new Float32Array(3);
  m.apply(3, age, y, new Uint8Array([1, 1, 1]), vis, 1 / 72);
  for (const v of y) assert.ok(Math.abs(v - 0.1) < 1e-6, 'first frame shows the old curve');
  // Then it converges, without overshoot, to the new values.
  let prevHead = y[2];
  for (let f = 0; f < 200; f++) {
    y.set([0.3, 0.2, 0.5]);
    m.apply(3, age, y, new Uint8Array([1, 1, 1]), vis, 1 / 72);
    assert.ok(y[2] >= prevHead - 1e-6 && y[2] <= 0.5 + 1e-6);
    prevHead = y[2];
  }
  assert.ok(Math.abs(y[2] - 0.5) < 1e-3);
  assert.equal(m.active, false);
});

test('seek morph fades in a trail that did not exist before', () => {
  const m = new TrailMorph(33, 0.35);
  const age = new Float32Array([1, 0]);
  m.capture(2, age, new Float32Array([0, 0]), new Float32Array([0, 0]), 0);
  const y = new Float32Array([0.2, 0.2]);
  const vis = new Float32Array(2);
  m.apply(2, age, y, new Uint8Array([1, 1]), vis, 1 / 72);
  assert.equal(vis[0], 0, 'invisible at first, no pop');
  assert.equal(y[1], 0, 'head starts at the dormant orb height');
  for (let f = 0; f < 200; f++) {
    y.set([0.2, 0.2]);
    m.apply(2, age, y, new Uint8Array([1, 1]), vis, 1 / 72);
  }
  assert.ok(vis[0] > 0.99);
});

test('interpByAge reads a curve ordered oldest first', () => {
  const age = [1, 0.5, 0];
  const v = [0, 10, 20];
  assert.equal(interpByAge(3, age, v, 0.75), 5);
  assert.equal(interpByAge(3, age, v, 0), 20);
  assert.equal(interpByAge(3, age, v, 2), 0);
});

test('note queue releases notes when they are heard, in order', () => {
  const q = new NoteQueue(8);
  q.push(1, 0.5, 2.0);
  q.push(0, 0.9, 1.0);
  q.push(2, 0.4, 1.5);
  const out: number[] = [];
  q.drain(0.5, (i) => out.push(i));
  assert.deepEqual(out, [], 'nothing before its time');
  q.drain(1.6, (i) => out.push(i));
  assert.deepEqual(out, [0, 2]);
  q.drain(10, (i) => out.push(i));
  assert.deepEqual(out, [0, 2, 1]);
  assert.equal(q.size, 0);
});

test('note queue: the ending roll call lights orbs one by one, not all at once', () => {
  const q = new NoteQueue();
  const t0 = 1.2;
  for (let i = 0; i < 9; i++) q.push(i, 0.6, t0 + i * 0.45);
  const lit: number[] = [];
  for (let now = 0; now < 6; now += 1 / 72) {
    q.drain(now, (i, _v, when) => {
      assert.ok(now >= when && now - when < 1 / 72 + 1e-9, 'lit within a frame of its sound');
      lit.push(i);
    });
  }
  assert.deepEqual(lit, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('note queue drops the oldest when full', () => {
  const q = new NoteQueue(2);
  q.push(0, 1, 1);
  q.push(1, 1, 2);
  q.push(2, 1, 3);
  const out: number[] = [];
  q.drain(10, (i) => out.push(i));
  assert.deepEqual(out, [1, 2]);
});
