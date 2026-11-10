/**
 * Where the hand panel may be: a pose relative to the user's starting head
 * (the rig: head at the origin, looking down -Z), kept inside a safe zone.
 *
 *   yaw    degrees, + to the right (0: straight ahead)
 *   elev   degrees, + up (the default lap tray is about -50)
 *   dist   meters from the head to the panel's center
 *
 * A pose, not a world position: the rig is re-anchored to the head when the
 * session (re)starts, so a saved pose lands at the same place relative to
 * the user even if the tracking origin moved. The panel always turns to face
 * the head (readable from anywhere it can go).
 *
 * The safe zone:
 *   - within reach and not in the face: 0.3 to 0.62 m from the head
 *   - never behind the user: at most 60 degrees to either side
 *   - below the eyes; when in front of the bands, low enough that its top edge
 *     stays under the chart (the chart and the events band are never covered);
 *     beside the bands it may come up to about eye level
 *
 * Pure (no three.js), tested in tests/panel.test.ts.
 */
import { BANDS, bandSpanDeg, HAND_PANEL } from '../config.ts';

export interface PanelPose {
  yaw: number;
  elev: number;
  dist: number;
}

const DEG = Math.PI / 180;

export const PANEL_LIMITS = {
  yaw: 60,
  elevMin: -72,
  /** Beside the bands (|yaw| >= sideYaw): the highest the panel's center may go. */
  elevSide: -6,
  distMin: 0.3,
  distMax: 0.62,
  /** Half the panel's height (the taller Year Journey panel, meters): its top edge is center + this. */
  halfHeight: 0.15,
  /** In front of the bands below this yaw; beside them above sideYaw (blended between). */
  frontYaw: 30,
  sideYaw: 48,
};

/** The lap tray of config HAND_PANEL, as a pose. */
export const DEFAULT_PANEL: PanelPose = poseOf(0, HAND_PANEL.y, -HAND_PANEL.z);

/** The pose of a rig-local position. */
export function poseOf(x: number, y: number, z: number): PanelPose {
  const dist = Math.hypot(x, y, z);
  return {
    yaw: Math.atan2(x, -z) / DEG,
    elev: Math.atan2(y, Math.hypot(x, z)) / DEG,
    dist,
  };
}

/** The rig-local position of a pose. */
export function positionOf(p: PanelPose): [number, number, number] {
  const c = Math.cos(p.elev * DEG);
  return [p.dist * c * Math.sin(p.yaw * DEG), p.dist * Math.sin(p.elev * DEG), -p.dist * c * Math.cos(p.yaw * DEG)];
}

/**
 * Euler angles (radians, order YXZ) that turn the panel to face the head.
 * (Its +Z, the side the buttons are on, points at the origin.)
 */
export function facingOf(p: PanelPose): { x: number; y: number } {
  return { x: p.elev * DEG, y: -p.yaw * DEG };
}

/** The highest the panel's center may be at this yaw (degrees). */
export function maxElev(yaw: number, dist: number): number {
  // In front: the panel's top edge stays below the chart's bottom edge.
  const top = Math.atan2(PANEL_LIMITS.halfHeight, dist) / DEG;
  const front = bandSpanDeg(BANDS.chart).bottom - top;
  const a = Math.abs(yaw);
  if (a <= PANEL_LIMITS.frontYaw) return front;
  if (a >= PANEL_LIMITS.sideYaw) return PANEL_LIMITS.elevSide;
  const k = (a - PANEL_LIMITS.frontYaw) / (PANEL_LIMITS.sideYaw - PANEL_LIMITS.frontYaw);
  return front + (PANEL_LIMITS.elevSide - front) * k;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The nearest safe pose. */
export function clampPose(p: PanelPose): PanelPose {
  const yaw = clamp(p.yaw, -PANEL_LIMITS.yaw, PANEL_LIMITS.yaw);
  const dist = clamp(p.dist, PANEL_LIMITS.distMin, PANEL_LIMITS.distMax);
  const elev = clamp(p.elev, PANEL_LIMITS.elevMin, maxElev(yaw, dist));
  return { yaw, elev, dist };
}

/** True when the pose is already inside the safe zone (within a hair). */
export function isSafe(p: PanelPose): boolean {
  const c = clampPose(p);
  return Math.abs(c.yaw - p.yaw) < 1e-6 && Math.abs(c.elev - p.elev) < 1e-6 && Math.abs(c.dist - p.dist) < 1e-6;
}

export const PANEL_STORAGE_KEY = 'ctm-panel';

/** A saved pose (JSON), or null when it is missing, malformed or outside the safe zone. */
export function parseSaved(raw: string | null): PanelPose | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PanelPose & { v: number }>;
    if (v.v !== 1) return null;
    const p = { yaw: Number(v.yaw), elev: Number(v.elev), dist: Number(v.dist) };
    if (![p.yaw, p.elev, p.dist].every(Number.isFinite)) return null;
    return isSafe(p) ? p : null;
  } catch {
    return null;
  }
}

export function serialize(p: PanelPose): string {
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return JSON.stringify({ v: 1, yaw: r(p.yaw), elev: r(p.elev), dist: r(p.dist) });
}

/** True when the pose is the default one (nothing to save or reset). */
export function isDefault(p: PanelPose): boolean {
  return Math.abs(p.yaw - DEFAULT_PANEL.yaw) < 0.5 && Math.abs(p.elev - DEFAULT_PANEL.elev) < 0.5 && Math.abs(p.dist - DEFAULT_PANEL.dist) < 0.005;
}
