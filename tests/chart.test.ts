/**
 * Tests for the Multi-Currency Timeline math (src/data/chart-series.ts) on
 * the real bundled data, and for its link to the playback clock.
 * Run: node --test tests/chart.test.ts   (Node >= 22.18 strips TS types)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { changeLabel, changeSeries, changeText, chartRange, niceTicks, spreadLabels, tickLabel } from '../src/data/chart-series.ts';
import { Timeline, type HistoryFile } from '../src/data/timeline.ts';
import { DEFAULT_PACING, PlaybackClock } from '../src/playback/clock.ts';
import { createSamples, sampleTrail } from '../src/visual/trail-sampling.ts';

const W = 52;
const SLOT_ORDER = ['CAD', 'GBP', 'EUR', 'CHF', 'INR', 'CNY', 'KRW', 'JPY', 'AUD'];
const history = JSON.parse(readFileSync(new URL('../public/data/history.json', import.meta.url), 'utf8')) as HistoryFile;
const timeline = new Timeline(history, SLOT_ORDER);
const slot = (code: string) => timeline.slots[SLOT_ORDER.indexOf(code)];

/** All nine lines at playhead p, as the chart computes them. */
function lines(p: number) {
  return SLOT_ORDER.map((code) => {
    const s = slot(code);
    const smp = createSamples(W);
    sampleTrail(s.strength, s.first, p, W, smp);
    const pct = new Float32Array(smp.count);
    const base = changeSeries(smp, p - W, pct);
    return { code, s, smp, pct, base };
  });
}

/** Units per USD at a week index, from the weekly data. */
const rate = (code: string, t: number) => slot(code).firstRate / Math.exp(Timeline.sample(slot(code).strength, t));

test('every line starts at 0% at the same moment: the window start', () => {
  const p = timeline.indexOf('1986-06-06');
  for (const l of lines(p)) {
    assert.ok(l.base, l.code);
    assert.equal(l.base!.late, false, `${l.code} has data for the whole window`);
    assert.equal(l.base!.baseT, p - W, `${l.code} is measured from the common start`);
    assert.ok(Math.abs(l.pct[0]) < 1e-9, `${l.code} starts at 0%`);
  }
});

test('changePct = (exp(strength(t) - strength(t0)) - 1) * 100, i.e. the change in value vs USD', () => {
  const p = timeline.indexOf('1986-06-06');
  for (const l of lines(p)) {
    const head = l.pct[l.smp.count - 1];
    // Value in dollars = 1 / rate, so the change in value is rate(t0) / rate(t) - 1.
    const expected = (rate(l.code, p - W) / rate(l.code, p) - 1) * 100;
    assert.ok(Math.abs(head - expected) < 1e-3, `${l.code}: ${head} vs ${expected}`);
    assert.equal(l.base!.headPct, head);
  }
  // A known move: the yen gained against the dollar after September 1985.
  const yen = lines(p).find((l) => l.code === 'JPY')!;
  assert.ok(yen.base!.headPct > 25, `yen +${yen.base!.headPct.toFixed(1)}%`);
});

test('no line before a currency has data, and a later start is flagged, never filled with 0%', () => {
  // Before the won's data begins: no line at all.
  const before = lines(timeline.indexOf('1980-06-06')).find((l) => l.code === 'KRW')!;
  assert.equal(before.base, null);
  assert.ok([...before.smp.valid.slice(0, before.smp.count)].every((v) => v === 0));
  // Its first year: the line starts at its first data week and says so.
  const first = slot('KRW').first;
  const during = lines(first + 20).find((l) => l.code === 'KRW')!;
  assert.equal(during.base!.late, true);
  assert.equal(during.base!.baseT, first);
  for (let k = 0; k < during.smp.count; k++) {
    if (during.smp.t[k] < first) assert.equal(during.smp.valid[k], 0, 'nothing drawn before the data');
  }
});

test('one shared y-range for all lines (never per currency), with 0% always on it', () => {
  for (const date of ['1950-01-06', '1973-06-01', '1986-06-06', '1998-01-02', '2008-12-05', '2022-11-04']) {
    const ls = lines(timeline.indexOf(date));
    const r = chartRange(
      ls.map((l) => l.base),
      ls.map(() => false),
    );
    assert.ok(r.lo < 0 && r.hi > 0, `${date}: 0% is on the axis`);
    ls.forEach((l, i) => {
      if (!l.base || i === r.clipped) return;
      assert.ok(l.base.min >= r.lo && l.base.max <= r.hi, `${date} ${l.code} fits the shared range`);
    });
  }
});

test('an extreme outlier may leave the scale, but never a line in focus, and only to rescue moving lines', () => {
  const ext = [{ min: -2, max: 4 }, { min: -5, max: 1 }, { min: -60, max: 0 }, null];
  const r = chartRange(ext, [false, false, false, false]);
  assert.equal(r.clipped, 2);
  assert.ok(r.lo > -10, 'the others keep the scale');
  // In focus (an event or solo): kept on the scale.
  assert.equal(chartRange(ext, [false, false, true, false]).clipped, -1);
  // 1949: the Mark's devaluation while the other lines are flat stays on the scale.
  const r1950 = chartRange(
    lines(timeline.indexOf('1950-01-06')).map((l) => l.base),
    SLOT_ORDER.map(() => false),
  );
  assert.equal(r1950.clipped, -1);
  assert.ok(r1950.lo < -20);
});

test('the lines flow with time: a week moves left by exactly the time that passed, at any speed', () => {
  const s = slot('JPY');
  const a = createSamples(W);
  const b = createSamples(W);
  const p = timeline.indexOf('1990-03-02');
  sampleTrail(s.strength, s.first, p, W, a);
  sampleTrail(s.strength, s.first, p + 5, W, b);
  const week = Math.floor(p) - 10;
  const ageA = a.age[[...a.t].indexOf(week)];
  const ageB = b.age[[...b.t].indexOf(week)];
  assert.ok(Math.abs(ageB - ageA - 5 / W) < 1e-6);
});

test('pause, chapter jumps and Replay all follow the one playback clock', () => {
  const clock = new PlaybackClock(timeline.count - 1, { ...DEFAULT_PACING, floatStart: 1200, slowDowns: [] });
  clock.seek(timeline.indexOf('1985-04-26'));
  const p0 = clock.position;
  clock.paused = true;
  clock.advance(1);
  assert.equal(clock.position, p0, 'paused: no flow');
  clock.paused = false;
  clock.advance(0.5);
  assert.ok(clock.position > p0);
  // A jump shows the target's history directly (nothing carried over).
  const target = timeline.indexOf('2008-01-04');
  clock.seek(target);
  const fresh = lines(target);
  const viaClock = lines(clock.position);
  fresh.forEach((l, i) => assert.deepEqual([...l.pct], [...viaClock[i].pct]));
  // Replay: back to 1948.
  clock.seek(0);
  assert.equal(clock.position, 0);
  assert.equal(clock.ended, false);
});

test('today: each line ends at its latest rate, measured on the same common base', () => {
  const s = slot('JPY');
  const last = timeline.count - 1;
  const smp = createSamples(W);
  const todayStrength = Timeline.sample(s.strength, last) + Math.log(1.01); // 1% stronger than the last week
  sampleTrail(s.strength, s.first, last + 0.3, W, smp, { index: last + 0.3, value: todayStrength });
  const pct = new Float32Array(smp.count);
  const base = changeSeries(smp, last + 0.3 - W, pct)!;
  const expected = (Math.exp(todayStrength - Timeline.sample(s.strength, last + 0.3 - W)) - 1) * 100;
  assert.ok(Math.abs(base.headPct - expected) < 1e-3);
});

test('gridlines and labels', () => {
  assert.deepEqual(niceTicks(-3, 3), [-2, 0, 2]);
  for (const [lo, hi] of [
    [-3, 3],
    [-55, 8],
    [-0.5, 22],
  ]) {
    const t = niceTicks(lo, hi);
    assert.ok(t.includes(0), `${lo}..${hi} has 0%`);
    assert.ok(t.length >= 3 && t.length <= 9);
    assert.ok(t.every((v) => v >= lo && v <= hi));
  }
  assert.equal(tickLabel(10), '+10%');
  assert.equal(tickLabel(0), '0%');
  assert.equal(tickLabel(-2.5), '−2.5%');
  assert.equal(changeLabel('JPY', 8.44), 'JPY ▲ +8.4%');
  assert.equal(changeText(-12.06), '▼ −12.1%');
  assert.equal(changeText(0.01), '· 0.0%');
});

test('right-hand labels never overlap and keep the lines’ order', () => {
  const gap = 0.033;
  const ys = [0.1, 0.101, 0.099, 0.1, -0.05, -0.051, 0.15, -0.15, 0.0];
  const out = spreadLabels(ys, gap, -0.17, 0.17);
  const order = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b] || a - b);
  for (let k = 1; k < order.length; k++) {
    assert.ok(out[order[k]] - out[order[k - 1]] >= gap - 1e-9, 'spaced');
  }
  assert.ok(out.every((y) => y >= -0.17 - 1e-9 && y <= 0.17 + 1e-9), 'inside the chart');
  // A label with room stays exactly at its line.
  assert.deepEqual(spreadLabels([0.1], gap, -0.17, 0.17), [0.1]);
});
