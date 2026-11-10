/**
 * Tests for the historical content shown in the portals (people, places,
 * policies) and the live "what happened" readout.
 * Run: node --test tests/history.test.ts   (Node >= 22.18 strips TS types)
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EVENTS } from '../src/data/events.ts';
import { formatRate, readoutLine, type HistoryEventContent } from '../src/data/history-content.ts';
import { PORTAL_SCENES } from '../src/data/portals.ts';

const root = new URL('../', import.meta.url);
const content = JSON.parse(readFileSync(new URL('public/data/history-content.json', root), 'utf8')) as {
  events: HistoryEventContent[];
};
const DAY = 86400000;

test('every portal has content: where, who, policies and two dated photos', () => {
  for (const sc of PORTAL_SCENES) {
    const c = content.events.find((e) => e.id === sc.eventId);
    assert.ok(c, `content for ${sc.eventId}`);
    assert.ok(c.where.city && c.where.country);
    assert.ok(c.people.length >= 3, `${sc.eventId}: at least three verified people`);
    assert.ok(c.policies.length >= 1);
    assert.equal(c.portal?.photos.length, 2, `${sc.eventId}: a backdrop and a floating photo`);
    for (const ph of c.portal!.photos) {
      assert.ok(existsSync(new URL(`public/${ph.src}`, root)), ph.src);
      assert.ok(ph.taken && ph.license && ph.artist && ph.sourceUrl);
    }
  }
});

test('the decision date is close to the event on the time-lapse grid', () => {
  for (const c of content.events) {
    const e = EVENTS.find((ev) => ev.id === c.id);
    assert.ok(e, c.id);
    const gap = Math.abs(Date.parse(c.date) - Date.parse(e.date)) / DAY;
    assert.ok(gap <= 14, `${c.id}: ${gap} days apart`);
  }
});

test('people are verified for the date and never shown with a stand-in portrait', () => {
  for (const c of content.events) {
    for (const p of c.people) {
      assert.ok(p.verified.qid.startsWith('Q'), p.name);
      assert.ok(p.verified.start! <= c.date && (!p.verified.end || c.date <= p.verified.end), `${p.name} in office on ${c.date}`);
      if (p.portrait) assert.ok(existsSync(new URL(`public/${p.portrait.src}`, root)), p.portrait.src);
    }
  }
  // An unverifiable person stays out (see docs/history-verification.md).
  assert.ok(!content.events.some((c) => c.people.some((p) => p.key === 'limcy')));
});

test('readout: before the date only the current rate, after it the change', () => {
  assert.equal(readoutLine('Yen', 242, 239.4, false), 'Yen 239 per USD');
  assert.equal(readoutLine('Yen', 241.6, 153.2, true), 'Yen 242 → 153 per USD (+58% vs USD)');
  assert.equal(readoutLine('Won', 888, 1743, true), 'Won 888 → 1,743 per USD (-49% vs USD)');
  assert.equal(readoutLine('Mark', 2.889, 2.7, true), 'Mark 2.89 → 2.70 per USD (+7.0% vs USD)');
  // Year Journey: the two observations are named, so the event's day is not taken for the rate's.
  assert.equal(readoutLine('Yen', 241.6, 219.4, true, { event: 'Sep 20', now: 'Sep 27' }), 'Yen 242 (Sep 20) → 219 (Sep 27) per USD (+10% vs USD)');
  assert.equal(formatRate(0.6771), '0.677');
});
