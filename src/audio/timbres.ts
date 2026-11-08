/**
 * Per-currency timbres, built from tiny additive/FM recipes so everything is
 * synthesized at runtime (no audio files, no licensing questions).
 *
 * partials    harmonic amplitudes for the pluck oscillator (PeriodicWave)
 * pad         harmonic amplitudes for the soft sustained layer
 * fmRatio/fmIndex/fmDecay  a decaying FM modulator gives bells/plucks their bite
 */
import type { TimbreId } from '../config.js';

export interface Timbre {
  partials: number[];
  pad: number[];
  attack: number;
  decay: number;
  fmRatio: number;
  fmIndex: number;
  fmDecay: number;
  /** Low-pass cutoff of the voice in Hz at calm markets. */
  cutoff: number;
  /** Relative loudness, tuned by ear so no voice dominates. */
  gain: number;
}

export const TIMBRES: Record<TimbreId, Timbre> = {
  wood: { partials: [1, 0, 0.12, 0, 0.04], pad: [1, 0.1], attack: 0.004, decay: 0.5, fmRatio: 4, fmIndex: 0.6, fmDecay: 0.05, cutoff: 2400, gain: 1.0 },
  glass: { partials: [1, 0.2], pad: [1, 0.05, 0.03], attack: 0.005, decay: 1.6, fmRatio: 3.5, fmIndex: 1.6, fmDecay: 0.7, cutoff: 5000, gain: 0.7 },
  bell: { partials: [1, 0.3, 0.1], pad: [1, 0.12, 0.04], attack: 0.006, decay: 2.2, fmRatio: 1.4, fmIndex: 1.1, fmDecay: 1.0, cutoff: 3600, gain: 0.75 },
  chime: { partials: [1, 0, 0, 0.08], pad: [1, 0.02], attack: 0.004, decay: 2.6, fmRatio: 2.76, fmIndex: 0.7, fmDecay: 0.9, cutoff: 6000, gain: 0.45 },
  reed: { partials: [1, 0.5, 0.33, 0.25, 0.2, 0.16], pad: [1, 0.2, 0.08], attack: 0.02, decay: 0.9, fmRatio: 1, fmIndex: 0.3, fmDecay: 0.3, cutoff: 1500, gain: 0.7 },
  harp: { partials: [1, 0.45, 0.25, 0.12, 0.06], pad: [1, 0.1], attack: 0.003, decay: 1.3, fmRatio: 2, fmIndex: 0.4, fmDecay: 0.2, cutoff: 3200, gain: 0.7 },
  flute: { partials: [1, 0.08, 0.03], pad: [1, 0.04], attack: 0.07, decay: 1.0, fmRatio: 1, fmIndex: 0.15, fmDecay: 0.4, cutoff: 3000, gain: 0.75 },
  koto: { partials: [1, 0.6, 0.4, 0.3, 0.2, 0.1], pad: [1, 0.08], attack: 0.002, decay: 0.85, fmRatio: 3, fmIndex: 0.5, fmDecay: 0.08, cutoff: 2600, gain: 0.7 },
  mallet: { partials: [1, 0, 0, 0.25], pad: [1, 0.06], attack: 0.003, decay: 0.65, fmRatio: 4, fmIndex: 0.3, fmDecay: 0.03, cutoff: 2800, gain: 0.9 },
};
