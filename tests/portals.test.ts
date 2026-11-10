/**
 * Tests for the Historical Portals: scene metadata, timing and placement.
 * Run: node --test tests/portals.test.ts   (Node >= 22.18 strips TS types)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EVENTS, FLOAT_START } from '../src/data/events.ts';
import { displayablePhoto, IMPRESSION_NOTE, PORTAL_SCENES, provenance, type PortalScene } from '../src/data/portals.ts';
import { Timeline, type HistoryFile } from '../src/data/timeline.ts';
import { DEFAULT_PACING, PlaybackClock, slowDownsFor } from '../src/playback/clock.ts';
import { PORTAL_TIMING, PortalDirector } from '../src/playback/portal-director.ts';

const SLOT_ORDER = ['CAD', 'GBP', 'EUR', 'CHF', 'INR', 'CNY', 'KRW', 'JPY', 'AUD'];
const history = JSON.parse(readFileSync(new URL('../public/data/history.json', import.meta.url), 'utf8')) as HistoryFile;
const timeline = new Timeline(history, SLOT_ORDER);
const LEAD = 16;

/** Units per USD of a slot at a date (from the bundled weekly data). */
function rate(slot: string, date: string): number {
  const s = timeline.slots[SLOT_ORDER.indexOf(slot)];
  return s.firstRate / Math.exp(Timeline.sample(s.strength, timeline.indexOf(date)));
}

test('exactly the four requested scenes, each tied to its major event and date', () => {
  assert.deepEqual(
    PORTAL_SCENES.map((s) => [s.eventId, s.city, s.eventDate.slice(0, 4)]),
    [
      ['gold-break', 'Washington, D.C.', '1971'],
      ['dollar-adjustment', 'Tokyo', '1985'],
      ['asian-crisis', 'Seoul', '1997'],
      ['gfc', 'New York', '2008'],
    ],
  );
  for (const sc of PORTAL_SCENES) {
    const e = EVENTS.find((ev) => ev.id === sc.eventId);
    assert.ok(e, `event ${sc.eventId} exists`);
    assert.equal(e.tier, 'major');
    assert.equal(e.date, sc.eventDate, 'portal date is the event date (not the caption trigger)');
    for (const slot of sc.affectedSlots) assert.ok(SLOT_ORDER.includes(slot));
  }
});

test('captions use the requested short descriptions', () => {
  const text = (id: string) => EVENTS.find((e) => e.id === id)!.text;
  assert.equal(text('gold-break'), "The dollar's link to gold breaks. A new monetary era begins.");
  assert.equal(text('dollar-adjustment'), 'Major economies coordinate to weaken the dollar. The yen strengthens in the years that follow.');
  assert.equal(text('asian-crisis'), 'Currency turmoil spreads across Asia. The Korean won loses much of its value.');
  assert.equal(text('gfc'), 'A global financial crisis sends shockwaves through currency markets.');
});

test('no named people or brands in any on-screen text', () => {
  const banned = /nixon|reagan|plaza|volcker|bush|obama|lehman|hotel|tower name|times square|coca|sony|toyota|samsung|hyundai/i;
  const texts = [
    ...EVENTS.flatMap((e) => [e.id, e.label, e.text]),
    ...PORTAL_SCENES.flatMap((s) => [s.eventId, s.city, s.region, s.period, s.title, s.detail, provenance(s)]),
  ];
  for (const t of texts) assert.doesNotMatch(t, banned, t);
  assert.ok(!banned.test(FLOAT_START));
});

test('detail numbers match the bundled data', () => {
  const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a.toFixed(2)} vs ${b}`);
  near(rate('JPY', '1971-08-13'), 357, 2);
  near(rate('JPY', '1973-12-28'), 280, 3);
  near(rate('JPY', '1985-09-20'), 242, 2);
  near(rate('JPY', '1987-12-25'), 127, 2);
  near(rate('EUR', '1985-09-20'), 2.9, 0.05); // DEM units before 1999
  near(rate('EUR', '1987-12-25'), 1.6, 0.05);
  near(rate('KRW', '1997-06-27'), 888, 5);
  // "about 1,700 by the end of 1997": the last weekly observation (26 December, a day the won swung by hundreds;
  // see docs/rates-crosscheck.md) is 1,743; H.10 gives 1,695 for 31 December.
  near(rate('KRW', '1997-12-26'), 1700, 50);
  assert.ok(rate('KRW', '1998-12-25') < rate('KRW', '1997-12-26'), 'the won recovered part of the loss in 1998');
  assert.ok(rate('JPY', '2008-11-28') < rate('JPY', '2008-06-27'), 'the yen rose against the dollar in autumn 2008');
  near(rate('KRW', '2008-06-27'), 1040, 10);
  near(rate('KRW', '2008-11-28'), 1470, 10);
  const audLoss = 1 - rate('AUD', '2008-07-18') / rate('AUD', '2008-10-24');
  near(audLoss, 1 / 3, 0.03);
});

test('only verified, local photos may be displayed; otherwise an impression is labelled', () => {
  for (const s of PORTAL_SCENES) {
    assert.equal(displayablePhoto(s), null, 'no photo is adopted yet');
    assert.equal(provenance(s), IMPRESSION_NOTE);
  }
  const base = PORTAL_SCENES[1];
  const photo = (status: 'verified' | 'pending', imagePath = 'portals/tokyo.webp'): PortalScene => ({
    ...base,
    visual: {
      kind: 'photo',
      imagePath,
      imageDateOrPeriod: '1986',
      sourceUrl: 'https://example.org/x',
      license: 'Public domain',
      attribution: 'Example',
      assetVerificationStatus: status,
      fallbackStyle: 'tokyo-1985',
    },
  });
  assert.equal(displayablePhoto(photo('pending')), null);
  assert.equal(displayablePhoto(photo('verified')), 'portals/tokyo.webp');
  assert.equal(displayablePhoto(photo('verified', 'https://example.org/remote.jpg')), null, 'never a remote URL');
  assert.match(provenance(photo('verified')), /Photo: Example \(1986\)/);
});

// --- Director --------------------------------------------------------------

const scenes = [
  { at: 100, lead: LEAD },
  { at: 300, lead: LEAD },
];

/** Step the director with a constant playback speed (weeks per second). */
function run(d: PortalDirector, p0: number, speed: number, seconds: number, dt = 1 / 72, flowing = true) {
  let p = p0;
  const log: { t: number; p: number; index: number; opened: boolean; dated: boolean; highlight: number; out: number }[] = [];
  for (let t = 0; t < seconds; t += dt) {
    if (flowing) p += speed * dt;
    const s = d.update(p, dt, flowing);
    log.push({ t, p, index: s.index, opened: s.justOpened, dated: s.justReachedDate, highlight: s.highlight, out: s.out });
  }
  return { p, log };
}

test('the window opens with the caption lead, highlights only on the actual date', () => {
  const d = new PortalDirector(scenes);
  const { log } = run(d, 80, 4, 16);
  const opened = log.find((l) => l.opened)!;
  assert.ok(opened.p >= 100 - LEAD && opened.p < 100 - LEAD + 0.2, 'opens when the caption appears');
  const dated = log.find((l) => l.dated)!;
  assert.ok(dated.p >= 100 && dated.p < 100.1, 'highlight starts on the event date');
  for (const l of log) if (l.p < 100) assert.equal(l.highlight, 0, 'no highlight before the date');
  // It closes after the hold and is then gone for good.
  const closed = log.findIndex((l, i) => i > 0 && log[i - 1].index === 0 && l.index === -1);
  assert.ok(closed > 0);
  const visibleS = log[closed].t - opened.t;
  assert.ok(visibleS >= PORTAL_TIMING.minVisibleS, `visible ${visibleS.toFixed(1)} s`);
});

test('pausing freezes the window and its timers', () => {
  const d = new PortalDirector(scenes);
  run(d, 84, 4, 1);
  const before = { ...d.state };
  run(d, 88, 4, 20, 1 / 72, false); // 20 s paused
  assert.equal(d.state.index, before.index);
  assert.equal(d.state.appear, before.appear);
  assert.equal(d.state.out, 0, 'never closes while paused');
});

test('a jump clears the open window; past windows do not come back', () => {
  const d = new PortalDirector(scenes);
  run(d, 90, 4, 2);
  assert.equal(d.state.index, 0);
  d.seek(200); // past scene 0, before scene 1's lead
  assert.equal(d.state.index, -1);
  run(d, 200, 4, 3);
  assert.equal(d.state.index, -1, 'scene 0 is in the past');
  // Jumping into scene 1's approach opens it at once.
  d.seek(295);
  const s = d.update(295, 1 / 72, true);
  assert.equal(s.index, 1);
  assert.equal(s.justOpened, true);
  // Replay: everything can play again.
  d.seek(0);
  run(d, 0, 20, 6);
  assert.equal(d.state.index, 0);
});

test('jumping just past a date shows no stale window', () => {
  const d = new PortalDirector(scenes);
  d.seek(101);
  run(d, 101, 4, 2);
  assert.equal(d.state.index, -1);
});

test('real pacing: each window is on screen for 6 to 12 s and gone before the next caption', () => {
  const lastIndex = timeline.count - 1;
  const at = PORTAL_SCENES.map((s) => timeline.indexOf(s.eventDate));
  for (const [k, a] of at.entries()) {
    const clock = new PlaybackClock(lastIndex, {
      ...DEFAULT_PACING,
      floatStart: timeline.indexOf(FLOAT_START),
      slowDowns: slowDownsFor(EVENTS, (dd) => timeline.indexOf(dd)),
    });
    const moments = EVENTS.map((e) => {
      const x = timeline.indexOf(e.date);
      return { at: x, trigger: x - (e.tier === 'major' ? LEAD : 3) };
    });
    const d = new PortalDirector(
      at.map((x) => ({ at: x, lead: LEAD, closeBy: Math.min(...moments.filter((m) => m.at > x + 0.5).map((m) => m.trigger)) })),
    );
    const closeBy = d['scenes'][k].closeBy as number;
    clock.seek(a - LEAD - 2);
    d.seek(clock.position);
    const dt = 1 / 72;
    let t = 0;
    let openedAt = -1;
    let datedAt = -1;
    let closedAt = -1;
    while (t < 40 && closedAt < 0) {
      clock.advance(dt);
      const s = d.update(clock.position, dt, true);
      if (s.justOpened && s.index === k) openedAt = t;
      if (s.justReachedDate && s.index === k) datedAt = t;
      if (openedAt >= 0 && s.index === -1) {
        closedAt = t;
        assert.ok(clock.position < closeBy, `${PORTAL_SCENES[k].city}: gone before the next caption`);
      }
      t += dt;
    }
    const total = closedAt - openedAt;
    console.log(`${PORTAL_SCENES[k].city}: ${total.toFixed(1)} s on screen, date at +${(datedAt - openedAt).toFixed(1)} s`);
    assert.ok(total >= 6 && total <= 12, `${PORTAL_SCENES[k].city}: ${total.toFixed(1)} s on screen`);
    assert.ok(datedAt - openedAt > 1, `${PORTAL_SCENES[k].city}: the date comes after the window opened`);
  }
});

test('a window closes early (and quickly) when the next caption is near', () => {
  const d = new PortalDirector([{ at: 100, lead: LEAD, closeBy: 130 }]);
  const { log } = run(d, 86, 6, 12);
  const closedAt = log.findIndex((l, i) => i > 0 && log[i - 1].index === 0 && l.index === -1);
  assert.ok(closedAt > 0);
  assert.ok(log[closedAt].p < 130, `closed at week ${log[closedAt].p.toFixed(1)}`);
});
