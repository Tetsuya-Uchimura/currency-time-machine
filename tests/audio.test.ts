/**
 * Tests for the sound's modes and ambient bed (src/audio/mix.ts): no held
 * chord under the guide, slow and steady transitions, the voice's duck held
 * across sentence gaps, and a bed whose chords keep moving.
 * Run: node --test tests/audio.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bellDegree, CHORD_S, chordAt, CROSSFADE_S, DUCK, duckLevel, FADE, MIX, mixOf, PROGRESSION, smooth, voicesMoved, type SoundMode } from '../src/audio/mix.ts';

/** Simulate the engine's smoothed levels through a list of [mode, seconds] at 60 fps. */
function simulate(steps: [SoundMode, number][], start: SoundMode = 'flowing') {
  let before = start === 'paused' ? 'flowing' : start;
  const m0 = mixOf(start);
  const l = { drone: m0.drone, pad: m0.pad, ambient: m0.ambient, reverb: m0.reverb };
  const trace: { mode: SoundMode; t: number; drone: number; pad: number; ambient: number; reverb: number }[] = [];
  let t = 0;
  const dt = 1 / 60;
  for (const [mode, seconds] of steps) {
    if (mode !== 'paused') before = mode;
    const m = mixOf(mode, before as Exclude<SoundMode, 'paused'>);
    for (let k = 0; k < seconds / dt; k++) {
      t += dt;
      l.drone = smooth(l.drone, m.drone, dt, FADE.dataOut, FADE.dataIn);
      l.pad = smooth(l.pad, m.pad, dt, FADE.dataOut, FADE.dataIn);
      l.reverb = smooth(l.reverb, m.reverb, dt, FADE.dataOut, FADE.dataIn);
      l.ambient = smooth(l.ambient, m.ambient, dt, FADE.ambientOut, FADE.ambientIn);
      trace.push({ mode, t, ...l });
    }
  }
  return trace;
}

test('guide: the data music (drone, a pad per currency) almost leaves; the moving bed carries the explanation', () => {
  assert.ok(MIX.guide.drone <= 0.15 && MIX.guide.pad <= 0.1, 'held tones down to a whisper');
  assert.equal(MIX.guide.ambient, 1);
  assert.ok(MIX.guide.reverb < MIX.flowing.reverb, 'less reverb tail under the voice');
  assert.equal(MIX.guide.bells, false, 'no bells over the voice');
  // After 4 s of explanation the held data tones are below a fifth of their level.
  const tr = simulate([['flowing', 3], ['guide', 4]]);
  const end = tr[tr.length - 1];
  assert.ok(end.drone < 0.2 && end.pad < 0.2, `drone ${end.drone.toFixed(2)}, pad ${end.pad.toFixed(2)}`);
  assert.ok(end.ambient > 0.75);
});

test('flowing: the data music exactly as designed, no bed', () => {
  assert.deepEqual(MIX.flowing, { drone: 1, pad: 1, ambient: 0, reverb: 1, bells: false });
});

test('pause is its own state: it keeps the mix it paused in (the output fades instead)', () => {
  assert.deepEqual(mixOf('paused', 'guide'), MIX.guide);
  assert.deepEqual(mixOf('paused', 'flowing'), MIX.flowing);
  const tr = simulate([['guide', 5], ['paused', 3], ['guide', 1]], 'guide');
  const atPause = tr.find((x) => x.mode === 'paused')!;
  const last = tr[tr.length - 1];
  assert.ok(Math.abs(atPause.ambient - last.ambient) < 0.01, 'the bed is where it was after resuming');
});

test('warp: the data music out, the tunnel over a low bed', () => {
  assert.equal(MIX.warp.drone, 0);
  assert.equal(MIX.warp.pad, 0);
  assert.ok(MIX.warp.ambient > 0 && MIX.warp.ambient < 0.5);
});

test('transitions are gradual: never more than a small step per frame, no overshoot', () => {
  const tr = simulate([['selection', 6], ['warp', 3], ['guide', 6], ['flowing', 2], ['guide', 6], ['flowing', 6], ['summary', 6], ['paused', 2], ['summary', 2]], 'selection');
  for (let k = 1; k < tr.length; k++) {
    for (const key of ['drone', 'pad', 'ambient', 'reverb'] as const) {
      const step = Math.abs(tr[k][key] - tr[k - 1][key]);
      assert.ok(step < 0.02, `${tr[k].mode} at ${tr[k].t.toFixed(2)} s: ${key} jumps ${step.toFixed(3)}`);
      assert.ok(tr[k][key] >= -1e-9 && tr[k][key] <= 1 + 1e-9);
    }
  }
});

test('guide -> flowing: the data music comes back without a bump (under half after 0.5 s, nearly all after 6 s)', () => {
  const tr = simulate([['guide', 8], ['flowing', 0.5]]);
  assert.ok(tr[tr.length - 1].drone < 0.5);
  const tr2 = simulate([['guide', 8], ['flowing', 6]]);
  assert.ok(tr2[tr2.length - 1].drone > 0.95);
});

test('a short flow between two beats does not empty the room or flood it', () => {
  // Beats a few weeks apart: 2 s of flowing between two explanations.
  const tr = simulate([['guide', 10], ['flowing', 2], ['guide', 0.1]]);
  const gap = tr.filter((x) => x.mode === 'flowing');
  assert.ok(Math.min(...gap.map((x) => x.ambient)) > 0.4, 'the bed recedes slowly');
  assert.ok(Math.max(...gap.map((x) => x.drone)) < 0.8, 'the data music rises slowly');
});

test("the voice's duck holds through the pause between two sentences, then releases", () => {
  assert.equal(duckLevel(true, 10, 0), DUCK.level);
  assert.equal(duckLevel(false, 10.3, 10), DUCK.level, '0.3 s after a sentence: still ducked');
  assert.equal(duckLevel(false, 10 + DUCK.holdS + 0.05, 10), 1, 'after the hold: back up');
  assert.ok(DUCK.releaseS > DUCK.attackS * 4, 'down fast, back slowly');
  // Simulated: sentences with 0.4 s gaps keep the duck down the whole time.
  let d = 1;
  let quietSince = -1e9;
  let speaking = false;
  let maxDuring = 0;
  const dt = 1 / 60;
  for (let t = 0; t < 12; t += dt) {
    const now = t % 3; // 2.6 s sentence, 0.4 s gap
    const was = speaking;
    speaking = now < 2.6;
    if (was && !speaking) quietSince = t;
    d = smooth(d, duckLevel(speaking, t, quietSince), dt, DUCK.attackS, DUCK.releaseS);
    if (t > 1) maxDuring = Math.max(maxDuring, d);
  }
  assert.ok(maxDuring < DUCK.level + 0.02, `the music never swells between sentences (max ${maxDuring.toFixed(3)})`);
});

test('the bed moves: every chord change moves at least two voices, no voice holds a pitch for more than two chords', () => {
  const n = PROGRESSION.length;
  for (let i = 0; i < n; i++) {
    const a = chordAt(i);
    const b = chordAt(i + 1);
    const c = chordAt(i + 2);
    assert.ok(voicesMoved(a, b) >= 2, `chord ${i} -> ${i + 1}`);
    for (let v = 0; v < 4; v++) assert.ok(!(a[v] === b[v] && b[v] === c[v]), `voice ${v} held from chord ${i}`);
    assert.ok(a[0] < Math.min(...a.slice(1)), 'the bass is the lowest voice');
    for (const d of a) assert.ok(d >= -5 && d <= 19, 'inside the app scale range');
  }
  assert.ok(CHORD_S >= 2 * CROSSFADE_S, 'each chord is heard settled before the next');
  assert.ok(n * CHORD_S >= 60, 'the cycle is at least a minute');
  assert.deepEqual(chordAt(-1), chordAt(n - 1));
});

test('bells: on the current chord, an octave up; only while choosing or in the summary', () => {
  for (let k = 0; k < 6; k++) assert.ok(chordAt(3).slice(1).map((d) => d + 5).includes(bellDegree(3, k)));
  assert.equal(MIX.selection.bells, true);
  assert.equal(MIX.summary.bells, true);
  assert.equal(MIX.flowing.bells, false);
});
