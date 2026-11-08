/**
 * Tests for the /api/today Pages Function's pure helpers.
 * Run: node --test tests/today.test.ts   (Node >= 22.18 strips TS types)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildToday, CODES, latestAndPrevious, type RateRecord } from '../functions/api/today.ts';

test('ignores weekend re-blends and compares business days', () => {
  const s = new Map([
    ['2026-11-05', 157.0], // Thu
    ['2026-11-06', 158.2], // Fri
    ['2026-11-07', 158.21], // Sat
    ['2026-11-08', 158.19], // Sun
  ]);
  assert.deepEqual(latestAndPrevious(s), { date: '2026-11-06', rate: 158.2, prev: 157.0, prevDate: '2026-11-05' });
});

test('walks back over a holiday carry-over', () => {
  const s = new Map([
    ['2026-12-23', 150.0],
    ['2026-12-24', 151.0],
    ['2026-12-25', 151.0],
  ]);
  const r = latestAndPrevious(s)!;
  assert.equal(r.prev, 150.0);
  assert.equal(r.prevDate, '2026-12-23');
});

test('buildToday returns every code and the newest date', () => {
  const records: RateRecord[] = [];
  for (const code of CODES) {
    records.push({ date: '2026-11-05', base: 'USD', quote: code, rate: 1 });
    records.push({ date: '2026-11-06', base: 'USD', quote: code, rate: 1.01 });
  }
  records.push({ date: '2026-11-06', base: 'USD', quote: 'USD', rate: 1 });
  const body = buildToday(records);
  assert.equal(body.base, 'USD');
  assert.equal(body.asOf, '2026-11-06');
  assert.deepEqual(Object.keys(body.rates).sort(), [...CODES].sort());
  assert.equal(body.rates.JPY.prev, 1);
});

test('buildToday throws when a currency is missing (client falls back)', () => {
  assert.throws(() => buildToday([{ date: '2026-11-06', base: 'USD', quote: 'EUR', rate: 0.9 }]));
});
