/**
 * Static configuration: which currencies appear, where, and how they sound/look.
 *
 * Slots are ordered west -> east, like the world map, and their voices are
 * spread from the listener's left to right in the same order. Colors come
 * from the Okabe-Ito color-vision-deficiency-safe palette (plus a few light
 * tints for contrast on a dark sky); identity is never carried by color
 * alone: every line and marker also has its code, a place on the map and its
 * own timbre.
 */

export type TimbreId =
  | 'wood' // CAD: soft marimba-like wood
  | 'glass' // GBP: glassy FM bell
  | 'bell' // EUR: warm bell
  | 'chime' // CHF: high pure chime
  | 'reed' // INR: soft reedy pluck
  | 'harp' // CNY: bright harp pluck
  | 'flute' // KRW: breathy sine
  | 'koto' // JPY: plucked string
  | 'mallet'; // AUD: round mallet

export interface SlotMeta {
  /** Slot id as used in history.json (EUR slot is carried by DEM before 1999). */
  slot: string;
  /** Display names per segment code, e.g. { DEM: 'Deutsche Mark', EUR: 'Euro' }. */
  names: Record<string, string>;
  color: number;
  timbre: TimbreId;
  /** Base scale degree (0 = D3) of this voice in the pentatonic scale. */
  register: number;
}

// West -> east (left -> right of the listener).
export const SLOTS: SlotMeta[] = [
  { slot: 'CAD', names: { CAD: 'Canadian dollar' }, color: 0xd55e00, timbre: 'wood', register: 3 },
  { slot: 'GBP', names: { GBP: 'British pound' }, color: 0x56b4e9, timbre: 'glass', register: 6 },
  { slot: 'EUR', names: { DEM: 'Deutsche Mark', EUR: 'Euro' }, color: 0xf0e442, timbre: 'bell', register: 5 },
  { slot: 'CHF', names: { CHF: 'Swiss franc' }, color: 0xf2f2f2, timbre: 'chime', register: 11 },
  { slot: 'INR', names: { INR: 'Indian rupee' }, color: 0xe69f00, timbre: 'reed', register: 2 },
  { slot: 'CNY', names: { CNY: 'Chinese yuan' }, color: 0xcc79a7, timbre: 'harp', register: 8 },
  { slot: 'KRW', names: { KRW: 'Korean won' }, color: 0x009e73, timbre: 'flute', register: 9 },
  { slot: 'JPY', names: { JPY: 'Japanese yen' }, color: 0xa8b8ff, timbre: 'koto', register: 7 },
  { slot: 'AUD', names: { AUD: 'Australian dollar' }, color: 0x7fd4c1, timbre: 'mallet', register: 4 },
];

export const BASE_CURRENCY = { code: 'USD', name: 'US dollar' };

export const ATTRIBUTION = 'Exchange rate data: Frankfurter (frankfurter.dev)';

/**
 * Spatial layout: three bands in front of the seated user, top to bottom
 *
 *   events  Historical Events (photos, people, policies; the era between events)
 *   chart   Multi-Currency Timeline (the nine lines, one shared scale)
 *   map     Interactive World Currency Map (where each currency lives)
 *
 * Meters in rig space: the head is at the origin at start, looking down -Z.
 * Each band is centered straight ahead at height `y` and distance `z`, and
 * turned to face the head; the map is tilted back a further `tiltDeg`, like
 * a table seen from a chair. The bands are at different depths (events
 * farthest, map nearest), so a small head movement shows real parallax.
 * Together they span about 55 degrees vertically: seen with the eyes and a
 * slight nod, never a turn. Nothing ever moves the camera.
 */
export interface Band {
  y: number;
  z: number;
  width: number;
  height: number;
  /** Extra backward tilt (top edge away from the user), degrees. */
  tiltDeg?: number;
}

export const BANDS = {
  events: { y: 0.48, z: 1.42, width: 1.74, height: 0.48 } as Band,
  chart: { y: -0.03, z: 1.3, width: 1.74, height: 0.44 } as Band,
  /** height = width / MAP_ASPECT (src/data/world-map.ts; checked in tests). */
  map: { y: -0.5, z: 1.12, width: 1.3, height: 0.56, tiltDeg: 18 } as Band,
};

/** The hand panel (UIKit), low and close like a lap tray. */
export const HAND_PANEL = { y: -0.4, z: 0.33, tiltRad: -0.85 };

/** Pitch (radians, three.js rotation.x) that turns a band toward the head, plus its tilt. */
export function bandPitch(b: Band): number {
  return Math.atan2(b.y, b.z) - ((b.tiltDeg ?? 0) * Math.PI) / 180;
}

/** Elevation (degrees) of a band's top and bottom edges as seen from the head. */
export function bandSpanDeg(b: Band): { top: number; bottom: number } {
  const a = bandPitch(b);
  // In the vertical plane: up along the band is (cos a) up and (sin a) nearer.
  const dy = (Math.cos(a) * b.height) / 2;
  const dz = (Math.sin(a) * b.height) / 2;
  const deg = (y: number, z: number) => (Math.atan2(y, z) * 180) / Math.PI;
  return { top: deg(b.y + dy, b.z - dz), bottom: deg(b.y - dy, b.z + dz) };
}

/** Multi-Currency Timeline (src/visual/multi-currency-chart.ts), in the chart band's local meters. */
export const CHART = {
  /** History shown, in weeks (the same at any playback speed). */
  windowWeeks: 52,
  plotLeft: -0.78,
  plotRight: 0.58,
  plotHalfHeight: 0.15,
  /** Right-hand labels ("JPY ▲ +8.4%"): left edge, size and the least spacing. */
  labelX: 0.625,
  labelWidth: 0.23,
  labelHeight: 0.03,
  labelGap: 0.033,
  /** Line half-width (glow included) in calm weeks, plus extra when busy. */
  halfWidthBase: 0.0026,
  halfWidthVol: 0.0026,
  /** Faint time marks pinned every this many weeks: the flow shows even when rates are flat. */
  tickWeeks: 13,
};

/** Interactive World Currency Map (src/visual/world-currency-map.ts), in the map band's local meters. */
export const MAP = {
  labelWidth: 0.155,
  labelHeight: 0.05,
  usdLabelWidth: 0.17,
  markerRadius: 0.0075,
};

/**
 * Where each currency's voice is heard: spread west to east (the map's
 * order) across the chart band at eye level, never down at the map, so the
 * nine stay easy to tell apart.
 */
export const VOICES = { radius: 1.2, arcDeg: 80, y: -0.03, rise: 0.4 };
