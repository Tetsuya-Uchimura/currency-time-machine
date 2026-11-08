/**
 * Prints how long each part of the time-lapse takes with the current pacing.
 * Run: node scripts/simulate-pacing.ts   (Node >= 22.18 strips TS types)
 */
import { readFileSync } from 'node:fs';
import { CHAPTERS, EVENTS, FLOAT_START } from '../src/data/events.ts';
import { DEFAULT_PACING, PlaybackClock, slowDownsFor } from '../src/playback/clock.ts';

const history = JSON.parse(readFileSync(new URL('../public/data/history.json', import.meta.url), 'utf8'));
const start = Date.parse(history.start + 'T00:00:00Z');
const idx = (d: string) => (Date.parse(d + 'T00:00:00Z') - start) / (7 * 86400000);

const clock = new PlaybackClock(history.count - 1, {
  ...DEFAULT_PACING,
  floatStart: idx(FLOAT_START),
  slowDowns: slowDownsFor(EVENTS, idx),
});

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
console.log('event              at      gap');
let prevT = 0;
for (const e of EVENTS) {
  const t = clock.durationBetween(0, idx(e.date));
  console.log(`${e.id.padEnd(18)} ${fmt(t).padStart(5)}  +${(t - prevT).toFixed(1)}s ${e.tier}`);
  prevT = t;
}
console.log('chapters:', CHAPTERS.map((c) => `${c.label}@${fmt(clock.durationBetween(0, idx(c.date)))}`).join('  '));
console.log('fixed era:', fmt(clock.durationBetween(0, idx(FLOAT_START))));
console.log('total to today:', fmt(clock.durationBetween(0, history.count - 1)));
