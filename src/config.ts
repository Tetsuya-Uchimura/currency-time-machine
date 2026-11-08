/**
 * Static configuration: which currencies appear, where, and how they sound/look.
 *
 * Orbs are laid out west -> east from the listener's left to right, like a
 * world map wrapped around the seated user. Colors come from the Okabe-Ito
 * color-vision-deficiency-safe palette (plus a few light tints for contrast
 * on a dark sky); identity is never carried by color alone, every orb also
 * has a label, a fixed position and its own timbre.
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

/** Spatial layout (meters, relative to the seated user's head at start). */
export const LAYOUT = {
  /** Distance of the orb arc from the head: inside a seated arm's reach. */
  radius: 0.6,
  /** Total horizontal span of the arc in degrees (centered straight ahead). */
  arcDeg: 90,
  /** Orb "birth level" relative to eye height (slightly below the eyes). */
  baseY: -0.08,
  /** Max height travel above/below the birth level. */
  heightRange: 0.2,
  orbRadius: 0.032,
};
