/**
 * Tests for the guide's script (src/guide/guide-scripts.ts), the Year
 * Journey runner (src/playback/year-journey.ts) and the clock's year window.
 * Run: node --test tests/guide.test.ts   (Node >= 22.18 strips TS types)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ROBOT_SPOTS, SLOTS } from '../src/config.ts';
import { annualChanges, yearWindow } from '../src/data/annual-currency.ts';
import { eventsInYear, featuredRegions, leadersInYear, REGIONS, regionName, type AnnualEvent, type LeadersFile, type RegionId } from '../src/data/annual-history.ts';
import { eraAt } from '../src/data/eras.ts';
import { Timeline, type HistoryFile } from '../src/data/timeline.ts';
import { buildYearScript, FEATURED_YEARS, lineSeconds, STORIES, STRINGS, summaryLine, type Beat, type YearContext } from '../src/guide/guide-scripts.ts';
import { DEFAULT_PACING, PlaybackClock } from '../src/playback/clock.ts';
import { warpYearAt, YearRunner } from '../src/playback/year-journey.ts';

const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
const history = json<HistoryFile>('../public/data/history.json');
const leaders = json<LeadersFile>('../public/data/leaders.json');
const events = json<{ events: AnnualEvent[] }>('../public/data/annual-events.json').events;
const tl = new Timeline(
  history,
  SLOTS.map((s) => s.slot),
);
const iso = (k: number) => tl.dateAt(k).toISOString().slice(0, 10);
const lastIso = iso(tl.count - 1);

function context(year: number, showPeople = true): YearContext {
  const w = yearWindow(tl, year)!;
  const mid = iso(Math.round((w.first + w.last) / 2));
  const ev = eventsInYear(events, year, lastIso);
  const changes = annualChanges(tl, tl.slots, year);
  const featured =
    STORIES[year]?.featured ??
    featuredRegions(
      ev,
      changes.filter((c) => c && c.comparable).map((c) => ({ slot: c!.slot, pct: c!.pct })),
      mid,
    );
  return {
    year,
    window: w,
    indexOf: (d) => tl.indexOf(d),
    slots: tl.slots,
    changes,
    events: ev,
    featured: featured.length ? featured : (['USA'] as RegionId[]),
    leaders: (r) => leadersInYear(leaders, r, year, lastIso),
    regionName: (r) => regionName(r, mid),
    regionSlot: (r) => REGIONS[r].slot,
    regionSystem: (r) => REGIONS[r].system,
    era: eraAt(mid),
    showPeople,
    lastDate: lastIso,
  };
}

test('1985: world, leaders, the Plaza Accord at its date, the result; all inside the year', () => {
  const ctx = context(1985);
  const beats = buildYearScript(ctx);
  const w = ctx.window;
  assert.equal(beats[0].part, 'world');
  assert.match(beats[0].text, /^1985\./);
  assert.ok(beats.filter((b) => b.part === 'leaders').length === 3);
  const plaza = beats.find((b) => b.eventId === 'dollar-adjustment')!;
  assert.ok(plaza, 'the Plaza Accord is told');
  assert.equal(plaza.at, Math.ceil(tl.indexOf('1985-09-22')), 'at its date (the first week on or after it)');
  assert.match(plaza.text, /September 22/);
  assert.ok(plaza.focus.includes('JPY'));
  for (let i = 1; i < beats.length; i++) assert.ok(beats[i].at >= beats[i - 1].at, 'in time order');
  for (const b of beats) {
    assert.ok(b.at >= w.first && b.at <= w.last, `${b.id} inside the year`);
    assert.doesNotMatch(b.text, /undefined|NaN|null/);
  }
  const result = beats[beats.length - 1];
  assert.equal(result.id, 'result');
  // The result names the year's biggest gainer and loser, with the data's numbers.
  const ranked = ctx.changes.filter((c) => c && c.comparable).sort((a, b) => b!.pct - a!.pct);
  const top = ranked[0]!;
  assert.match(result.text, new RegExp(`gained the most against the dollar, ${Math.round(top.pct)}%`));
  // Leaders are named (full build).
  assert.ok(beats.some((b) => /Ronald Reagan/.test(b.text)));
  assert.ok(beats.some((b) => /Paul Volcker/.test(b.text)));
});

test('the 1985 opening computes its numbers from the data', () => {
  const text = buildYearScript(context(1985))[0].text;
  const m = text.match(/the Mark has lost (\d+)% .* the yen (\d+)%/);
  assert.ok(m, text);
  const k = SLOTS.findIndex((s) => s.slot === 'EUR');
  const s = tl.slots[k];
  const a = Math.ceil(tl.indexOf('1980-01-01'));
  const w = yearWindow(tl, 1985)!;
  const lost = -(Math.exp(s.strength[w.first] - s.strength[a]) - 1) * 100;
  assert.equal(Number(m[1]), Math.round(lost));
});

test('contest-safe script: no real person is named', () => {
  const names = new Set(leaders.terms.map((t) => t.name));
  for (const year of [1948, 1971, 1985, 1990, 1997, 2008, 2022, 2026]) {
    const ctx = context(year, false);
    for (const b of [...buildYearScript(ctx), { text: summaryLine(ctx) } as Beat]) {
      for (const n of names) assert.ok(!b.text.includes(n), `${year}: "${n}" in "${b.text}"`);
    }
  }
});

test('every year builds a script that ends in the year', () => {
  for (let y = 1948; y <= Number(lastIso.slice(0, 4)); y++) {
    const ctx = context(y);
    const beats = buildYearScript(ctx);
    assert.ok(beats.length >= 3, `${y}`);
    assert.equal(beats[beats.length - 1].at, ctx.window.last);
    if (!ctx.events.length) assert.ok(beats[0].text.includes(STRINGS.noEvents), `${y} says it has no verified event`);
    const total = beats.reduce((t, b) => t + lineSeconds(b.text), 0) + (ctx.window.last - ctx.window.first) / 1.6;
    assert.ok(total < 150, `${y}: about ${total.toFixed(0)} s`);
  }
  // A late start is said, with the first rate from the data.
  const b69 = buildYearScript(context(1969)).find((b) => b.id === 'joins-JPY')!;
  assert.match(b69.text, /joins our data here, at 358 JPY per US dollar/);
});

test('the five featured years have their own opening and places', () => {
  for (const y of FEATURED_YEARS) {
    const ctx = context(y);
    assert.deepEqual(ctx.featured, STORIES[y].featured);
    assert.ok(buildYearScript(ctx)[0].text.startsWith(String(y)));
  }
});

test('intro is short (10 to 15 seconds of reading)', () => {
  const s = STRINGS.intro.reduce((t, l) => t + lineSeconds(l), 0);
  assert.ok(s >= 9 && s <= 16, `${s.toFixed(1)} s`);
});

test('runner: stops at each beat, waits for speech within limits, never passes the year', () => {
  const beats = [
    { at: 10, text: 'a' },
    { at: 20, text: 'b' },
    { at: 30, text: 'c' },
  ];
  const r = new YearRunner(beats, 30);
  const times = () => ({ minS: 1, maxS: 3 });
  assert.equal(r.stopAt, 10);
  assert.equal(r.update(0.1, 9, false, false, times), null);
  assert.equal(r.update(0.1, 10, false, false, times)?.text, 'a');
  assert.ok(r.holding);
  r.update(0.5, 10, true, false, times);
  r.update(0.6, 10, true, false, times);
  assert.ok(r.holding, 'still speaking after the minimum');
  r.update(2, 10, true, false, times);
  assert.ok(!r.holding, 'the maximum ends it even if speech hangs');
  assert.equal(r.stopAt, 20);
  // Paused: nothing ages.
  r.update(0.1, 20, false, false, times);
  r.update(5, 20, false, true, times);
  assert.ok(r.holding);
  r.skip();
  r.update(0.01, 20, false, false, times);
  assert.ok(!r.holding);
  r.update(0.01, 30, false, false, times);
  r.update(1.1, 30, false, false, times);
  assert.ok(r.doneAt(30));
});

test('clock window: plays only the year, stops at the guide’s beats, never crosses into the next year', () => {
  const c = new PlaybackClock(tl.count - 1, { ...DEFAULT_PACING, floatStart: 0, slowDowns: [] });
  const w = yearWindow(tl, 1997)!;
  c.setWindow(w.first, w.last, 1.6);
  assert.equal(c.position, w.first);
  c.stopAt = w.first + 5;
  for (let k = 0; k < 400; k++) c.advance(0.05);
  assert.ok(Math.abs(c.position - (w.first + 5)) < 1e-9, 'waits at the beat');
  c.stopAt = Infinity;
  for (let k = 0; k < 2000; k++) c.advance(0.05);
  assert.equal(c.position, w.last);
  assert.ok(c.ended);
  c.seek(w.first - 50);
  assert.equal(c.position, w.first, 'cannot seek before the year');
  c.clearWindow();
  c.seek(0);
  assert.equal(c.position, 0);
});

test('time tunnel counter: from the start year to the target, held at both ends', () => {
  assert.equal(warpYearAt(2026, 1985, 0), 2026);
  assert.equal(warpYearAt(2026, 1985, 1), 1985);
  assert.equal(warpYearAt(2026, 1985, 0.9), 1985);
  let prev = 2026;
  for (let p = 0; p <= 1; p += 0.02) {
    const y = warpYearAt(2026, 1985, p);
    assert.ok(y <= prev && y >= 1985);
    prev = y;
  }
});

test('the robot never sits in front of the face, and stays within reach of a glance', () => {
  for (const [x, y, z] of Object.values(ROBOT_SPOTS)) {
    const yaw = (Math.atan2(-x, -z) * 180) / Math.PI;
    const pitch = (Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI;
    assert.ok(Math.abs(yaw) > 15 || pitch < -8, `not straight ahead (${yaw.toFixed(0)}, ${pitch.toFixed(0)})`);
    assert.ok(Math.abs(yaw) < 45 && Math.abs(pitch) < 25, 'in view');
    assert.ok(Math.hypot(x, y, z) >= 0.6, 'not too close');
  }
});
