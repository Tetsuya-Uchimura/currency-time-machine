/**
 * The movable hand panel: its safe zone, facing, and saved pose.
 * Run: node --test tests/panel.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BANDS, bandSpanDeg, HAND_PANEL } from '../src/config.ts';
import {
  clampPose,
  DEFAULT_PANEL,
  facingOf,
  isDefault,
  isSafe,
  maxElev,
  PANEL_LIMITS,
  parseSaved,
  poseOf,
  positionOf,
  serialize,
} from '../src/interaction/panel-placement.ts';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

test('the default pose is the lap tray of config HAND_PANEL, and it is safe', () => {
  const [x, y, z] = positionOf(DEFAULT_PANEL);
  assert.ok(close(x, 0) && close(y, HAND_PANEL.y) && close(z, -HAND_PANEL.z));
  assert.ok(isSafe(DEFAULT_PANEL));
  assert.ok(isDefault(DEFAULT_PANEL));
  // It faces the head, tilted about as before (config tiltRad).
  assert.ok(Math.abs(facingOf(DEFAULT_PANEL).x - HAND_PANEL.tiltRad) < 0.06);
});

test('pose and position convert both ways', () => {
  for (const p of [
    { yaw: 30, elev: -40, dist: 0.5 },
    { yaw: -55, elev: -10, dist: 0.35 },
    { yaw: 0, elev: -70, dist: 0.6 },
  ]) {
    const q = poseOf(...positionOf(p));
    assert.ok(close(q.yaw, p.yaw, 1e-6) && close(q.elev, p.elev, 1e-6) && close(q.dist, p.dist, 1e-9), JSON.stringify(q));
  }
});

test('the panel faces the head wherever it is: its +Z points at the origin', () => {
  for (const p of [DEFAULT_PANEL, { yaw: 40, elev: -30, dist: 0.45 }, { yaw: -60, elev: -6, dist: 0.62 }]) {
    const { x: ax, y: ay } = facingOf(p);
    // +Z rotated by X (ax) then Y (ay) (Euler order YXZ applies Y last in world terms).
    const zx = Math.cos(ax) * Math.sin(ay);
    const zy = -Math.sin(ax);
    const zz = Math.cos(ax) * Math.cos(ay);
    const [px, py, pz] = positionOf(p);
    const d = Math.hypot(px, py, pz);
    const dot = (zx * -px + zy * -py + zz * -pz) / d;
    assert.ok(dot > 0.999, `${JSON.stringify(p)}: ${dot}`);
  }
});

test('never in the face, never out of reach, never behind', () => {
  const far = clampPose({ yaw: 0, elev: -40, dist: 2 });
  const near = clampPose({ yaw: 0, elev: -40, dist: 0.05 });
  const behind = clampPose({ yaw: 170, elev: -40, dist: 0.5 });
  assert.equal(far.dist, PANEL_LIMITS.distMax);
  assert.equal(near.dist, PANEL_LIMITS.distMin);
  assert.equal(behind.yaw, PANEL_LIMITS.yaw);
  assert.ok(PANEL_LIMITS.distMin >= 0.3 && PANEL_LIMITS.distMax <= 0.65, 'a seated arm reaches it');
  assert.ok(PANEL_LIMITS.yaw <= 60, 'a glance and a small turn, never behind');
  const [, , z] = positionOf(behind);
  assert.ok(z < 0, 'still in front');
});

test('in front of the bands the panel stays below the chart; beside them it may come up', () => {
  const chartBottom = bandSpanDeg(BANDS.chart).bottom;
  for (const dist of [PANEL_LIMITS.distMin, 0.45, PANEL_LIMITS.distMax]) {
    const p = clampPose({ yaw: 0, elev: 20, dist });
    const top = p.elev + (Math.atan2(PANEL_LIMITS.halfHeight, dist) * 180) / Math.PI;
    assert.ok(top <= chartBottom + 1e-9, `top ${top.toFixed(1)} vs chart ${chartBottom.toFixed(1)}`);
  }
  assert.ok(maxElev(55, 0.5) > maxElev(0, 0.5) + 15, 'higher beside the bands');
  assert.ok(maxElev(55, 0.5) < 0, 'still below the eyes');
  // Continuous in between (no jump while dragging sideways).
  for (let yaw = 0; yaw < 60; yaw += 0.5) assert.ok(Math.abs(maxElev(yaw + 0.5, 0.5) - maxElev(yaw, 0.5)) < 1.5);
});

test('saved poses: restored when valid, refused when malformed or unsafe', () => {
  const p = { yaw: 35.25, elev: -30.5, dist: 0.48 };
  assert.deepEqual(parseSaved(serialize(p)), p);
  assert.equal(parseSaved(null), null);
  assert.equal(parseSaved('not json'), null);
  assert.equal(parseSaved('{"v":2,"yaw":0,"elev":-40,"dist":0.5}'), null, 'unknown version');
  assert.equal(parseSaved('{"v":1,"yaw":"x","elev":-40,"dist":0.5}'), null);
  assert.equal(parseSaved('{"v":1,"yaw":0,"elev":-40,"dist":3}'), null, 'out of reach');
  assert.equal(parseSaved('{"v":1,"yaw":0,"elev":10,"dist":0.5}'), null, 'over the chart');
  assert.equal(parseSaved('{"v":1,"yaw":120,"elev":-40,"dist":0.5}'), null, 'behind');
});
