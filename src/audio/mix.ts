/**
 * The sound's modes and their mix, and the ambient bed's chords. Pure (no
 * Web Audio), unit tested in tests/audio.test.ts; src/audio/engine.ts plays it.
 *
 * Why modes: the data music (drone, a pad per currency, plucks) follows the
 * history clock. When the clock stands still (choosing a year, the guide
 * explaining, the summary) no pluck is made and every pad holds its pitch:
 * left alone, the drone and nine pads would hold one unchanging chord, with
 * its reverb, for as long as the guide speaks. So each mode sets how much of
 * the data music sounds, and a quiet ambient bed (the same scale, its own
 * slow chord changes on the audio clock) carries the still moments.
 *
 *   selection  choosing a year           ambient bed, a faint data bed, sparse bells
 *   warp       the time tunnel           the tunnel's rush over a low bed; data music out
 *   flowing    the year (or history) plays  the data music as designed; no bed
 *   guide      Tock explains (a beat, a pinched place)  the bed; drone and pads almost out
 *   summary    the year in review        the bed, a faint data bed, sparse bells
 *   paused     the user paused           not a mix: the whole output fades out and the
 *                                        audio clock is suspended (and comes back as it was)
 *
 * The guide's whole explanation (a beat from start to end), not each spoken
 * sentence, decides the guide mode. The voice adds its own duck on top, with
 * a hold so a pause between sentences does not let the music swell.
 */

export type SoundMode = 'selection' | 'warp' | 'flowing' | 'guide' | 'summary' | 'paused';

export interface Mix {
  /** Multipliers of the data music's drone and pads (1: as designed). */
  drone: number;
  pad: number;
  /** Ambient bed level (1: full, still quiet under the voice). */
  ambient: number;
  /** Multiplier of the reverb return. */
  reverb: number;
  /** Sparse soft bells on the bed's chord (never while the guide explains). */
  bells: boolean;
}

export const MIX: Record<Exclude<SoundMode, 'paused'>, Mix> = {
  selection: { drone: 0.15, pad: 0.1, ambient: 1, reverb: 0.8, bells: true },
  warp: { drone: 0, pad: 0, ambient: 0.35, reverb: 1, bells: false },
  flowing: { drone: 1, pad: 1, ambient: 0, reverb: 1, bells: false },
  guide: { drone: 0.12, pad: 0.06, ambient: 1, reverb: 0.55, bells: false },
  summary: { drone: 0.15, pad: 0.1, ambient: 0.9, reverb: 0.8, bells: true },
};

/** The mix of a mode ('paused' keeps the mix it paused in: the output fades instead). */
export function mixOf(mode: SoundMode, before: Exclude<SoundMode, 'paused'> = 'flowing'): Mix {
  return MIX[mode === 'paused' ? before : mode];
}

/**
 * Time constants (seconds, for setTargetAtTime: about 63% of the way per
 * constant). Fades are slow both ways, so a short flow between two beats
 * never jumps in level, and the data music comes back without a bump.
 */
export const FADE = {
  /** The data music steps back when the guide starts explaining. */
  dataOut: 1.0,
  /** ...and comes back when the year flows again. */
  dataIn: 1.4,
  /** The bed rises... */
  ambientIn: 1.6,
  /** ...and recedes slowly, so a short flow between beats does not empty the room. */
  ambientOut: 2.4,
};

/** The voice's duck: down fast, held through short pauses between sentences, back slowly. */
export const DUCK = { level: 0.42, attackS: 0.15, holdS: 0.7, releaseS: 1.1 };

/** Duck multiplier at `now` (seconds): the voice is speaking, or stopped less than holdS ago. */
export function duckLevel(speaking: boolean, now: number, quietSince: number): number {
  if (speaking || now - quietSince < DUCK.holdS) return DUCK.level;
  return 1;
}

/**
 * One step of an exponential approach to `target` over `dt` seconds, with a
 * time constant of `down` when falling and `up` when rising. Never overshoots.
 */
export function smooth(current: number, target: number, dt: number, down: number, up: number): number {
  if (dt <= 0) return current;
  const tau = target < current ? down : up;
  return target + (current - target) * Math.exp(-dt / tau);
}

// ---------------------------------------------------------------------------
// The ambient bed: four voices, a slow cycle of chords from the app's own scale
// (D major pentatonic, scale degrees as in scale.ts: 0 = D3, 5 = D4), so it
// always agrees with the currencies' notes. Bass, then three upper voices.
// Every change moves at least two voices, and no voice holds a pitch for more
// than two chords (about 16 s).
// ---------------------------------------------------------------------------

export const PROGRESSION: readonly (readonly number[])[] = [
  [-5, 3, 6, 7], // D2 A3 E4 F#4   D add9
  [-1, 2, 5, 8], // B2 F#3 D4 A4   B minor 7
  [-4, 4, 6, 8], // E2 B3 E4 A4    E sus
  [-2, 3, 5, 7], // A2 A3 D4 F#4   D over A
  [-1, 2, 6, 9], // B2 F#3 E4 B4   B minor add 11
  [-3, 4, 7, 8], // F#2 B3 F#4 A4  B minor over F#
  [-4, 3, 6, 8], // E2 A3 E4 A4    A sus over E
  [-2, 2, 5, 7], // A2 F#3 D4 F#4  D over A
];

/** Seconds per chord, and the crossfade between two chords. */
export const CHORD_S = 8;
export const CROSSFADE_S = 3;

export function chordAt(step: number): readonly number[] {
  const n = PROGRESSION.length;
  return PROGRESSION[((step % n) + n) % n];
}

/** How many voices change between two chords. */
export function voicesMoved(a: readonly number[], b: readonly number[]): number {
  return a.reduce((n, d, i) => n + (d !== b[i] ? 1 : 0), 0);
}

/** A soft bell for the bed: one of the chord's upper notes, an octave up. */
export function bellDegree(step: number, k: number): number {
  const c = chordAt(step);
  return c[1 + (Math.abs(k) % 3)] + 5;
}
