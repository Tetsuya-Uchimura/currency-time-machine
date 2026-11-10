/**
 * Tock's touch reactions: which reaction a touch starts, the small version
 * while it speaks, no stacking, cooldowns, high fives.
 * Run: node --test tests/tock.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROBOT_SPOTS, TOCK_REACH } from '../src/config.ts';
import { REACTION, TockReactions, type ReactionFrame } from '../src/interaction/tock-reactions.ts';
import { reachSpotFor } from '../src/interaction/tock-companion.ts';

const free = { near: true, quiet: false, pointing: false };

/** Run for `s` seconds at 60 fps; returns the last frame. */
function run(r: TockReactions, s: number, state = free): ReactionFrame {
  let f!: ReactionFrame;
  for (let t = 0; t < s; t += 1 / 60) f = r.update(1 / 60, state);
  return f;
}

test('head, body and hand start different reactions', () => {
  const r = new TockReactions();
  assert.equal(r.touch('head', false).started, 'petted');
  run(r, 5);
  assert.equal(r.touch('body', false).started, 'surprised');
  run(r, 0.6);
  assert.equal(r.active, 'greeting', 'a surprise turns into a greeting (a wave)');
  run(r, 5);
  assert.equal(r.touch('hand', false).started, 'greeting', 'no hand up: a small wave');
});

test('every reaction ends on its own and Tock is back to its usual self', () => {
  const r = new TockReactions();
  for (const zone of ['head', 'body', 'hand'] as const) {
    r.touch(zone, false);
    const f = run(r, 6, { ...free, near: false });
    assert.equal(f.kind, null, zone);
  }
});

test('reactions never stack; a pat during a pat keeps it going, up to a limit', () => {
  const r = new TockReactions();
  r.touch('head', false);
  run(r, 0.3);
  assert.equal(r.touch('body', false).started, null, 'busy');
  // Keep patting every half second for 10 s: it stays petted, but not longer than the limit.
  let longest = 0;
  let age = 0;
  for (let k = 0; k < 20; k++) {
    r.touch('head', false);
    const f = run(r, 0.5);
    if (f.kind === 'petted') age = f.age;
    longest = Math.max(longest, age);
  }
  assert.ok(longest <= REACTION.pettedMaxS + 1e-6, `${longest}`);
});

test('a burst of touches is ignored (no runaway animation)', () => {
  const r = new TockReactions();
  run(r, 1);
  let started = 0;
  for (let k = 0; k < 30; k++) {
    if (r.touch(k % 2 ? 'body' : 'hand', false).started) started++;
    run(r, 0.03);
  }
  assert.ok(started <= 1, `${started}`);
});

test('while Tock speaks: only the small version, no sound, no high five offered', () => {
  const r = new TockReactions();
  const res = r.touch('head', true);
  assert.equal(res.started, 'petted');
  assert.equal(res.chirp, null);
  const f = r.update(1 / 60, { near: true, quiet: true, pointing: false });
  assert.ok(f.small);
  run(r, 5, { near: true, quiet: true, pointing: false });
  assert.equal(r.offering, false);
});

test('high five: offered after a happy moment when near and free; touching the hand completes it', () => {
  const r = new TockReactions();
  r.touch('head', false);
  run(r, REACTION.pettedS + 0.1);
  assert.ok(r.offering, 'hand up');
  const res = r.touch('hand', false);
  assert.equal(res.started, 'highfive');
  assert.ok(res.sparkle);
  assert.equal(res.chirp, 'highfive');
  assert.equal(r.offering, false);
});

test('the offer is withdrawn when a beat needs the hand, when Tock speaks, or when it leaves', () => {
  for (const state of [
    { near: true, quiet: false, pointing: true },
    { near: true, quiet: true, pointing: false },
    { near: false, quiet: false, pointing: false },
  ]) {
    const r = new TockReactions();
    r.touch('head', false);
    run(r, REACTION.pettedS + 0.1);
    assert.ok(r.offering);
    const f = run(r, 1, state);
    assert.equal(r.offering, false, JSON.stringify(state));
    assert.ok(f.offer < 0.1, 'the hand comes down');
  }
});

test('offers are spaced out', () => {
  const r = new TockReactions();
  r.touch('head', false);
  run(r, REACTION.pettedS + 0.1);
  assert.ok(r.offering);
  run(r, REACTION.offerS + 0.5);
  r.touch('head', false);
  run(r, REACTION.pettedS + 0.1);
  assert.equal(r.offering, false, 'too soon after the last offer');
});

test('the reach spot: within a seated arm, to the left, below the eyes, never in front of the face', () => {
  const [x, y, z] = TOCK_REACH.spot;
  const d = Math.hypot(x, y, z);
  const yaw = (Math.atan2(x, -z) * 180) / Math.PI;
  const pitch = (Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI;
  assert.ok(d >= 0.4 && d <= 0.58, `${d.toFixed(2)} m`);
  assert.ok(yaw < -30 && yaw > -60, `left side (${yaw.toFixed(0)})`);
  assert.ok(pitch < -8, 'below the eyes');
  // It comes from the left (the guide's side spot): the path never crosses the middle.
  assert.ok(ROBOT_SPOTS.side[0] < 0 && x < 0);
});

test('the reach spot moves aside only when the hand panel was moved next to it', () => {
  assert.equal(reachSpotFor(0), TOCK_REACH.spot, 'panel in its place');
  assert.equal(reachSpotFor(40), TOCK_REACH.spot, 'panel moved to the right');
  assert.equal(reachSpotFor(-40), TOCK_REACH.alt, 'panel moved to the left, beside the usual spot');
  const [x, y, z] = TOCK_REACH.alt;
  const d = Math.hypot(x, y, z);
  const pitch = (Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI;
  assert.ok(d >= 0.4 && d <= 0.58 && x < 0 && pitch < 0, 'the other spot: also within reach, left, below the eyes');
});

test('a pat right after the hello wave is answered (the cooldown is per zone)', () => {
  const r = new TockReactions();
  r.greet(false);
  run(r, REACTION.greetingS + 0.05);
  assert.equal(r.touch('head', false).started, 'petted');
  run(r, REACTION.pettedS + 0.05);
  assert.equal(r.touch('head', false).started, null, 'the same zone rests a moment');
  run(r, REACTION.cooldownS + 0.05);
  assert.equal(r.touch('head', false).started, 'petted');
});
