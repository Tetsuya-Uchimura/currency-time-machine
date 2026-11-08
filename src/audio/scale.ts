/**
 * Musical scale helpers. Every pitch in the experience is quantized to the
 * D major pentatonic scale (D E F# A B): it has no semitone steps, so any
 * combination of notes stays consonant and never turns into noise.
 */

const PENTATONIC = [0, 2, 4, 7, 9];
/** MIDI note of scale degree 0 (D3). */
const ROOT_MIDI = 50;
const MIN_DEGREE = -5; // D2
const MAX_DEGREE = 19; // B6

export function degreeToMidi(degree: number): number {
  const d = Math.max(MIN_DEGREE, Math.min(MAX_DEGREE, Math.round(degree)));
  const octave = Math.floor(d / 5);
  const step = ((d % 5) + 5) % 5;
  return ROOT_MIDI + 12 * octave + PENTATONIC[step];
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function degreeToHz(degree: number): number {
  return midiToHz(degreeToMidi(degree));
}

/**
 * Maps a currency's strength (log change since its birth) to scale steps.
 * tanh keeps huge long-run moves (e.g. the rupee since 1973) inside about
 * +-7 steps (~1.4 octaves) while small moves still change the pitch.
 */
export function strengthToSteps(strength: number): number {
  return Math.round(7 * Math.tanh(strength / 1.1));
}
