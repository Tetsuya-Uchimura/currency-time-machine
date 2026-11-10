/**
 * The ambient music's scores: three original pieces in D major, written out
 * note by note (nothing here is random). Pure data and helpers, unit tested
 * in tests/score.test.ts; src/audio/bed.ts plays them.
 *
 *   A  cinematic  Cinematic Ambient (the default): a warm pad, a soft piano answering
 *                 each chord, a gentle bass; 66 bpm, two 16-bar sections
 *   B  piano      Gentle Piano: a short melody over a broken-chord left hand, a pad
 *                 only as a halo; 72 bpm, an 18-bar song, its second verse calmer
 *   C  cosmic     Cosmic Atmosphere: slow open chords (sus, lydian), a brighter
 *                 breathing pad, sparse high "stars" with an echo, no held bass; 50 bpm
 *
 * Harmony: the scale is D major (the currencies play its pentatonic subset, D E
 * F# A B, so everything agrees). Progressions move by voice leading (common
 * tones kept, other voices by step), with suspensions that resolve (Asus4 -> A,
 * A7sus4 -> D), chords of different lengths (1 to 4 bars), and landing chords
 * with space. Melodies use chord tones and gentle tensions (9ths, 6ths), never a
 * half step above a sounding chord tone (no minor-9th clashes).
 *
 * Registers: pads between G3 and C#5 (about 196-554 Hz) and quiet; the piano
 * mostly D4-B5; the bass is a soft sine an octave below the chord (never a held
 * drone: it changes with every chord, and the cosmic piece has none). The
 * voice's clarity band (about 1-4 kHz) is left to Tock: the bed is gently
 * filtered there while it speaks (bed.ts).
 */

export type BgmStyle = 'cinematic' | 'piano' | 'cosmic';
export const STYLES: BgmStyle[] = ['cinematic', 'piano', 'cosmic'];
export const STYLE_LABEL: Record<BgmStyle, string> = { cinematic: 'A  Cinematic Ambient', piano: 'B  Gentle Piano', cosmic: 'C  Cosmic Atmosphere' };

/** One note of a part: when (beats from the chord's start), which (MIDI), how loud (0..1). */
export interface ScoreNote {
  b: number;
  m: number;
  v: number;
  /** Kept when the guide speaks (the sparser version under the voice). */
  core?: boolean;
}

export interface ScoreChord {
  name: string;
  /** Length in bars of 4 beats (halves allowed). */
  bars: number;
  /** Soft bass note (MIDI), or null. */
  bass: number | null;
  /** Pad voicing (MIDI, low to high). */
  pad: number[];
  /** The upper part: piano (A, B) or stars (C). */
  notes: ScoreNote[];
}

export interface Score {
  style: BgmStyle;
  bpm: number;
  chords: ScoreChord[];
  /** Overall level, so the three pieces are equally loud (measured on rendered files). */
  gain: number;
  /** Mix of the piece (relative levels, tuned together in bed.ts). */
  pad: number;
  piano: number;
  bass: number;
  /** Pad low-pass in Hz, and how far a slow sweep moves it. */
  padCutoff: number;
  padSweep: number;
  /** Seconds a new pad note takes to swell in, and to fade out. */
  attack: number;
  release: number;
  /** Reverb send of the bed (the hall is shared with the data music). */
  reverb: number;
  /** Echo on the upper part (the cosmic piece's stars). */
  echo: boolean;
  /** A broken-chord left hand on the piano (the piano piece). */
  leftHand: boolean;
}

const c = (name: string, bars: number, bass: number | null, pad: number[], notes: [number, number, number, boolean?][]): ScoreChord => ({
  name,
  bars,
  bass,
  pad,
  notes: notes.map(([b, m, v, core]) => ({ b, m, v, ...(core ? { core: true } : {}) })),
});

/** A: Cinematic Ambient. Section A, then section B (variation), 32 bars, about 116 s. */
const CINEMATIC: Score = {
  style: 'cinematic',
  bpm: 66,
  gain: 1,
  pad: 1,
  piano: 1,
  bass: 1,
  padCutoff: 1500,
  padSweep: 350,
  attack: 2.6,
  release: 3.2,
  reverb: 0.26,
  echo: false,
  leftHand: false,
  chords: [
    // Section A: home, gently away, a suspension that resolves, and home again.
    c('Dmaj9', 2, 50, [57, 61, 64, 66], [[0, 69, 0.45, true], [1.5, 73, 0.34], [3, 76, 0.4, true], [6, 71, 0.3]]),
    c('Bm9', 2, 47, [57, 62, 64, 66], [[0, 71, 0.4, true], [2, 74, 0.32], [4, 73, 0.35, true], [6, 69, 0.3]]),
    c('Gmaj9', 2, 43, [59, 62, 66, 69], [[0, 71, 0.42, true], [1, 74, 0.3], [3, 78, 0.38, true], [5, 76, 0.3], [7, 74, 0.28]]),
    c('Asus4', 1, 45, [57, 62, 64, 69], [[0, 74, 0.38, true], [2, 76, 0.3]]),
    c('A', 1, 45, [57, 61, 64, 69], [[0, 73, 0.4, true], [2, 69, 0.3]]),
    c('F#m7', 2, 42, [57, 61, 64, 66], [[0, 69, 0.4, true], [1.5, 73, 0.32], [4, 76, 0.36, true], [6, 73, 0.28]]),
    c('Gmaj9', 2, 43, [57, 59, 62, 66], [[0, 71, 0.4, true], [2, 69, 0.3], [4, 66, 0.34, true], [6, 69, 0.28]]),
    c('Em9', 1, 52, [55, 59, 62, 66], [[0, 71, 0.36, true], [2, 66, 0.28]]),
    c('A7sus4', 1, 45, [55, 57, 62, 64], [[0, 69, 0.34, true], [2, 67, 0.28]]),
    c('Dadd9', 2, 50, [54, 57, 62, 64], [[0, 66, 0.38, true], [1, 69, 0.3], [2, 74, 0.34], [5, 76, 0.3]]),
    // Section B: the subdominant side, a longer climb, and a long landing with space.
    c('Gmaj7', 2, 43, [59, 62, 66, 69], [[0, 74, 0.38, true], [2, 71, 0.3], [4, 69, 0.32, true], [6, 66, 0.28]]),
    c('D/F#', 2, 42, [57, 62, 64, 66], [[0, 69, 0.36, true], [2, 74, 0.32], [4, 76, 0.36, true]]),
    c('Em7', 2, 52, [55, 59, 62, 67], [[0, 71, 0.36, true], [2, 74, 0.3], [4, 79, 0.3, true], [6, 78, 0.28]]),
    c('Bm9', 2, 47, [57, 62, 66, 73], [[0, 71, 0.34, true], [2, 69, 0.3], [4, 66, 0.32, true], [6, 73, 0.26]]),
    c('Gmaj9', 2, 43, [57, 59, 62, 66], [[0, 69, 0.34, true], [2, 71, 0.3], [4, 74, 0.34, true], [6, 76, 0.3]]),
    c('Asus2', 1, 45, [57, 59, 64, 69], [[0, 76, 0.34, true], [2, 74, 0.28]]),
    c('A', 1, 45, [57, 61, 64, 69], [[0, 73, 0.34, true], [2, 76, 0.28]]),
    c('D6/9', 4, 50, [57, 59, 64, 66], [[0, 69, 0.36, true], [2, 76, 0.3], [4, 73, 0.3], [8, 66, 0.26, true], [12, 69, 0.24]]),
  ],
};

/** B: Gentle Piano. An 18-bar song (about 60 s); every second verse plays only its core notes. */
const PIANO: Score = {
  style: 'piano',
  bpm: 72,
  gain: 1.85,
  pad: 0.35,
  piano: 1.1,
  bass: 0,
  padCutoff: 1100,
  padSweep: 200,
  attack: 3,
  release: 3,
  reverb: 0.22,
  echo: false,
  leftHand: true,
  chords: [
    c('D', 1, 50, [57, 62, 66], [[0, 69, 0.5, true], [1.5, 66, 0.35], [2, 69, 0.4], [3, 71, 0.38, true]]),
    c('F#m', 1, 54, [57, 61, 66], [[0, 73, 0.48, true], [2, 69, 0.38, true]]),
    c('G', 1, 55, [59, 62, 67], [[0, 71, 0.45, true], [1.5, 69, 0.33], [2, 67, 0.38, true], [3, 66, 0.35]]),
    c('D/A', 1, 45, [57, 62, 66], [[0, 64, 0.42, true]]),
    c('Bm', 1, 47, [59, 62, 66], [[0, 74, 0.46, true], [1.5, 73, 0.33], [2, 71, 0.38, true], [3, 66, 0.34]]),
    c('G', 1, 55, [59, 62, 67], [[0, 67, 0.4, true], [1, 69, 0.36], [2, 71, 0.42, true]]),
    c('Em7', 1, 52, [55, 59, 62], [[0, 76, 0.44, true], [1.5, 74, 0.33], [2, 71, 0.4, true]]),
    c('Asus4', 0.5, 45, [57, 62, 64], [[0, 69, 0.42, true]]),
    c('A', 0.5, 45, [57, 61, 64], []),
    c('D', 1, 50, [57, 62, 66], [[0, 66, 0.42, true], [1, 69, 0.36], [2, 74, 0.44, true]]),
    c('A/C#', 1, 49, [57, 61, 64], [[0, 73, 0.44, true], [1.5, 71, 0.32], [2, 69, 0.38, true]]),
    c('Bm', 1, 47, [59, 62, 66], [[0, 71, 0.42, true], [1, 74, 0.38], [2, 78, 0.44, true]]),
    c('F#m', 1, 54, [57, 61, 66], [[0, 76, 0.42, true], [1.5, 73, 0.32], [2, 69, 0.38, true]]),
    c('G', 1, 55, [59, 62, 67], [[0, 71, 0.42, true], [1.5, 69, 0.32], [2, 67, 0.36, true], [3, 71, 0.34]]),
    c('D/F#', 1, 54, [57, 62, 66], [[0, 69, 0.4, true], [2, 66, 0.36, true]]),
    c('Em', 1, 52, [55, 59, 64], [[0, 67, 0.4, true], [1, 66, 0.34], [2, 64, 0.38, true]]),
    c('A7sus4', 0.5, 45, [55, 57, 62], [[0, 64, 0.36, true]]),
    c('A7', 0.5, 45, [55, 57, 61], [[0, 67, 0.32]]),
    c('D6', 2, 50, [57, 59, 66], [[0, 66, 0.4, true], [0, 62, 0.3], [4, 69, 0.26]]),
  ],
};

/** C: Cosmic Atmosphere. 23 slow bars (about 110 s): open chords and a few stars with an echo. */
const COSMIC: Score = {
  style: 'cosmic',
  bpm: 50,
  gain: 1.05,
  pad: 1,
  piano: 0.8,
  bass: 0,
  padCutoff: 2000,
  padSweep: 700,
  attack: 3.6,
  release: 4.2,
  reverb: 0.3,
  echo: true,
  leftHand: false,
  chords: [
    c('Dsus2', 4, null, [57, 62, 64, 69], [[0, 62, 0.26, true], [2, 81, 0.25, true], [7, 86, 0.2], [11, 76, 0.22, true]]),
    c('Gmaj7#11', 3, null, [55, 59, 61, 66], [[0, 55, 0.24, true], [1, 78, 0.24, true], [6, 85, 0.18], [9, 81, 0.2, true]]),
    c('Bm11', 3, null, [57, 59, 64, 66], [[0, 59, 0.24, true], [2, 83, 0.22, true], [7, 78, 0.22]]),
    c('Em9', 2, null, [55, 59, 62, 66], [[0, 52, 0.22, true], [1, 83, 0.22, true], [5, 86, 0.18]]),
    c('Asus2', 2, null, [57, 59, 64, 69], [[0, 57, 0.24, true], [2, 76, 0.22, true], [6, 83, 0.2]]),
    c('Gmaj9', 3, null, [57, 59, 62, 66], [[0, 55, 0.24, true], [1, 81, 0.22, true], [6, 78, 0.2], [10, 86, 0.18]]),
    c('F#m11', 2, null, [54, 57, 59, 64], [[0, 54, 0.22, true], [2, 81, 0.2, true], [5, 76, 0.2]]),
    c('Dmaj9', 4, null, [57, 61, 64, 66], [[0, 50, 0.24, true], [1, 78, 0.22, true], [6, 85, 0.18], [11, 81, 0.2, true]]),
  ],
};

export const SCORES: Record<BgmStyle, Score> = { cinematic: CINEMATIC, piano: PIANO, cosmic: COSMIC };

export function secondsPerBeat(s: Score): number {
  return 60 / s.bpm;
}

export function chordSeconds(s: Score, ch: ScoreChord): number {
  return ch.bars * 4 * secondsPerBeat(s);
}

export function loopSeconds(s: Score): number {
  return s.chords.reduce((n, ch) => n + chordSeconds(s, ch), 0);
}

/**
 * The piano piece's left hand: the chord broken over each bar, root first
 * (in the D3-C#4 octave), then the pad's voices. Its second verse is calmer
 * (root and one voice). Two beats for a half-bar chord.
 */
export function leftHand(ch: ScoreChord, verse: number): ScoreNote[] {
  if (ch.bass === null) return [];
  const root = 48 + ((((ch.bass - 48) % 12) + 12) % 12);
  const [p0, p1, p2] = ch.pad;
  const out: ScoreNote[] = [];
  const beats = ch.bars * 4;
  for (let bar = 0; bar * 4 < beats; bar++) {
    const b0 = bar * 4;
    const pattern: [number, number, number][] = verse % 2 === 0
      ? [[0, root, 0.32], [1, p1 ?? p0, 0.22], [2, p2 ?? p1 ?? p0, 0.24], [3, p1 ?? p0, 0.2]]
      : [[0, root, 0.3], [2, p2 ?? p1 ?? p0, 0.22]];
    for (const [b, m, v] of pattern) if (b0 + b < beats) out.push({ b: b0 + b, m, v, core: b === 0 });
  }
  return out;
}

/**
 * The upper notes of a chord as played: on `verse` (pass through the piece),
 * with `sparse` (the guide is speaking) keeping only the core notes. The piano
 * piece's second verse is the sparse one, whatever the mode.
 */
export function chordNotes(s: Score, ch: ScoreChord, verse: number, sparse: boolean): ScoreNote[] {
  const calm = sparse || (s.style === 'piano' && verse % 2 === 1);
  const upper = ch.notes.filter((n) => !calm || n.core);
  return s.leftHand ? [...leftHand(ch, verse), ...upper] : upper;
}

/** D major scale pitch classes (D E F# G A B C#). */
export const D_MAJOR = new Set([2, 4, 6, 7, 9, 11, 1]);

/** MIDI note to Hz. */
export function midiHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
