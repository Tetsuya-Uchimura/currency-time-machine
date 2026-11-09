/**
 * Tests for the Year Journey's data: one year of the weekly history
 * (src/data/annual-currency.ts) and who led / what happened in it
 * (src/data/annual-history.ts, public/data/leaders.json and annual-events.json).
 * Run: node --test tests/annual.test.ts   (Node >= 22.18 strips TS types)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SLOTS } from '../src/config.ts';
import { annualChanges, rateAt, ranking, sharpestMove, yearSpan, yearWindow } from '../src/data/annual-currency.ts';
import {
  eventsInYear,
  featuredRegions,
  leadersInYear,
  REGIONS,
  regionName,
  regionsOfSlot,
  type AnnualEvent,
  type LeadersFile,
} from '../src/data/annual-history.ts';
import { Timeline, type HistoryFile } from '../src/data/timeline.ts';

const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
const history = json<HistoryFile>('../public/data/history.json');
const leaders = json<LeadersFile>('../public/data/leaders.json');
const events = json<{ events: AnnualEvent[] }>('../public/data/annual-events.json').events;
const tl = new Timeline(
  history,
  SLOTS.map((s) => s.slot),
);
const iso = (k: number) => tl.dateAt(k).toISOString().slice(0, 10);
const slot = (id: string) => SLOTS.findIndex((s) => s.slot === id);
const lastIso = iso(tl.count - 1);

test('every year from 1948 to the latest observed year can be visited', () => {
  const span = yearSpan(tl);
  assert.equal(span.min, 1948);
  assert.equal(span.max, Number(lastIso.slice(0, 4)));
  for (let y = span.min; y <= span.max; y++) {
    const w = yearWindow(tl, y);
    assert.ok(w, `${y} has a window`);
    assert.ok(w.first <= w.last);
    // Both ends are real weekly observations inside the year (never the next year's).
    assert.equal(iso(w.first).slice(0, 4), String(y));
    assert.equal(iso(w.last).slice(0, 4), String(y));
    assert.ok(Number.isInteger(w.first) && Number.isInteger(w.last));
  }
  assert.equal(yearWindow(tl, span.min - 1), null);
  assert.equal(yearWindow(tl, span.max + 1), null);
});

test('a year starts at its first weekly observation and ends at its last', () => {
  const w = yearWindow(tl, 1985)!;
  assert.equal(iso(w.first), '1985-01-04');
  assert.equal(iso(w.last), '1985-12-27');
  assert.equal(w.startsLate, false);
  assert.equal(w.ongoing, false);
  assert.ok(w.axisStart <= w.first && w.last < w.axisEnd);
  // 1948 begins in June (the data's start); the latest year is not over.
  const w48 = yearWindow(tl, 1948)!;
  assert.equal(iso(w48.first), '1948-06-25');
  assert.equal(w48.startsLate, true);
  const wLast = yearWindow(tl, yearSpan(tl).max)!;
  assert.equal(wLast.ongoing, lastIso < `${yearSpan(tl).max}-12-25`);
  assert.equal(wLast.last, tl.count - 1, 'no week after the data');
});

test('annual change = value vs USD between the two observations (the chart’s number)', () => {
  const c = annualChanges(tl, tl.slots, 1985)[slot('JPY')]!;
  assert.equal(c.fromDate, '1985-01-04');
  assert.equal(c.toDate, '1985-12-27');
  assert.ok(c.comparable && !c.late);
  // The yen strengthened in 1985 (fewer yen per dollar at the end).
  assert.ok(c.rateTo < c.rateFrom);
  assert.ok(Math.abs(c.pct - (c.rateFrom / c.rateTo - 1) * 100) < 1e-6, 'pct from the rates');
  assert.ok(c.pct > 15 && c.pct < 35, `${c.pct}`);
  assert.ok(c.rateFrom > 240 && c.rateFrom < 260 && c.rateTo > 195 && c.rateTo < 210, `${c.rateFrom} -> ${c.rateTo}`);
});

test('the Deutsche Mark and the euro: codes and units follow the history', () => {
  const k = slot('EUR');
  const c98 = annualChanges(tl, tl.slots, 1998)[k]!;
  assert.equal(c98.codeFrom, 'DEM');
  assert.equal(c98.codeTo, 'DEM');
  assert.ok(c98.rateFrom > 1.6 && c98.rateFrom < 1.9, `DEM ${c98.rateFrom}`);
  const c99 = annualChanges(tl, tl.slots, 1999)[k]!;
  assert.equal(c99.codeFrom, 'EUR');
  assert.equal(c99.fromDate, '1999-01-01');
  // Euro-era weeks are converted back from the chained Mark units.
  assert.ok(c99.rateFrom > 0.8 && c99.rateFrom < 0.9, `EUR ${c99.rateFrom}`);
  assert.ok(Math.abs(rateAt(tl.slots[k], c99.from) * tl.slots[k].chainFactor - tl.slots[k].firstRate / Math.exp(tl.slots[k].strength[c99.from])) < 1e-9);
});

test('currencies whose data begins inside a year are measured from there and never ranked', () => {
  const c69 = annualChanges(tl, tl.slots, 1969);
  const jpy = c69[slot('JPY')]!;
  assert.ok(jpy.late && !jpy.comparable, 'JPY joins in December 1969');
  assert.equal(jpy.fromDate, iso(tl.slots[slot('JPY')].first));
  assert.ok(!ranking(c69).some((c) => c.slot === 'JPY'));
  // CNY and KRW begin in the first week of 1981: a full year, ranked with the others.
  const c81 = annualChanges(tl, tl.slots, 1981);
  assert.ok(!c81[slot('CNY')]!.late && c81[slot('CNY')]!.comparable);
  // Before its data, a currency has no change at all (nothing is invented).
  assert.equal(annualChanges(tl, tl.slots, 1975)[slot('KRW')], null);
  // Ranking: strongest first, only one common period.
  const r = ranking(annualChanges(tl, tl.slots, 1985));
  assert.ok(r.length >= 7);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].pct >= r[i].pct);
  assert.ok(new Set(r.map((c) => c.fromDate)).size === 1, 'same start for all ranked');
});

test('the latest year is year to date, and its change ends at the last observation', () => {
  const y = yearSpan(tl).max;
  const c = annualChanges(tl, tl.slots, y)[slot('JPY')]!;
  assert.equal(c.toDate, lastIso);
});

test('sharpest stretch: the largest 8-week move inside the year', () => {
  const s = tl.slots[slot('KRW')];
  const w = yearWindow(tl, 1997)!;
  const m = sharpestMove(s, w.first, w.last)!;
  assert.ok(m.pct < -20, `the won's fall in late 1997: ${m.pct}`);
  assert.ok(iso(m.end) >= '1997-10-01');
});

test('leaders: verified holders of each office in a year (two when it changed hands)', () => {
  const names = (r: Parameters<typeof leadersInYear>[1], y: number, office: string) =>
    leadersInYear(leaders, r, y, lastIso)
      .find((o) => o.office.id === office)!
      .terms.map((t) => t.name);
  assert.deepEqual(names('USA', 1985, 'us-president'), ['Ronald Reagan']);
  assert.deepEqual(names('USA', 1985, 'us-fed'), ['Paul Volcker']);
  assert.deepEqual(names('GBR', 1990, 'uk-pm'), ['Margaret Thatcher', 'John Major']);
  assert.deepEqual(names('DEU', 1998, 'de-chancellor'), ['Helmut Kohl', 'Gerhard Schröder']);
  assert.ok(names('JPN', 1985, 'jp-pm').some((n) => /Nakasone/.test(n)));
  assert.ok(names('KOR', 1997, 'kr-president').some((n) => /Kim Young-sam/.test(n)));
  // Heads first, central banks after; every term has a source status.
  const usa = leadersInYear(leaders, 'USA', 2008, lastIso);
  assert.equal(usa[0].office.kind, 'head');
  for (const t of leaders.terms) {
    assert.ok(['both', 'wikidata', 'wikipedia'].includes(t.verified), `${t.name}`);
    assert.match(t.qid, /^Q\d+$/);
    assert.ok(!t.end || t.end >= t.start);
    if (t.portrait) assert.match(t.portrait.src, /^media\/leaders\/Q\d+\.webp$/);
  }
});

test('political systems are described as they are (no president for everyone)', () => {
  assert.match(REGIONS.CHE.system, /Federal Council/);
  assert.match(REGIONS.EA.system, /No single government/);
  assert.match(REGIONS.JPN.system, /Prime Minister/);
  const ea = leadersInYear(leaders, 'EA', 2010, lastIso);
  assert.ok(ea.every((o) => o.office.kind === 'cb'), 'the euro area: the ECB, not a head of government');
  assert.equal(leadersInYear(leaders, 'EA', 1990, lastIso).length, 0, 'no euro area before 1998');
  // West Germany and Germany are told apart.
  assert.equal(regionName('DEU', '1985-09-22'), 'West Germany');
  assert.equal(regionName('DEU', '1991-01-01'), 'Germany');
  assert.deepEqual(regionsOfSlot('EUR', '1998-12-31'), ['DEU']);
  assert.deepEqual(regionsOfSlot('EUR', '1999-01-01'), ['EA', 'DEU']);
});

test('events: verified, dated within their year, never after the data', () => {
  assert.ok(events.length >= 40);
  for (const e of events) {
    assert.ok(e.sources.length > 0 && e.sources.every((s) => s.url.startsWith('https://')), `${e.id} has sources`);
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
  }
  const y85 = eventsInYear(events, 1985, lastIso);
  assert.ok(y85.some((e) => e.date === '1985-09-22' && /Plaza/.test(e.title)));
  for (let y = 1948; y <= yearSpan(tl).max; y++) {
    for (const e of eventsInYear(events, y, lastIso)) {
      assert.equal(e.date.slice(0, 4), String(y));
      assert.ok(e.date <= lastIso);
    }
  }
  // The five featured years each have at least one verified event.
  for (const y of [1971, 1985, 1997, 2008, 2022]) assert.ok(eventsInYear(events, y, lastIso).length > 0, `${y}`);
});

test('featured places: from the year’s events first, then the biggest movers', () => {
  const y = 1992;
  const ev = eventsInYear(events, y, lastIso);
  const moves = annualChanges(tl, tl.slots, y)
    .filter((c) => c && c.comparable)
    .map((c) => ({ slot: c!.slot, pct: c!.pct }));
  const f = featuredRegions(ev, moves, `${y}-07-01`);
  assert.ok(f.length >= 1 && f.length <= 3);
  assert.equal(f[0], 'GBR', 'Black Wednesday');
  assert.ok(!featuredRegions(ev, moves, '1992-07-01').includes('EA'), 'no euro area before 1999');
});
