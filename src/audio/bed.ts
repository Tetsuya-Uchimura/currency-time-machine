/**
 * The ambient bed: plays a score (src/audio/score.ts) on any Web Audio
 * context, live (the app's) or offline (rendering a preview file, render.ts).
 *
 * Graph:
 *   pad notes (2 detuned oscillators each) -> pad low-pass (slow sweep) -\
 *   piano notes (osc -> own low-pass envelope -> gain) -------------------+-> mix
 *   bass notes (soft sine) -----------------------------------------------/
 *   piano -> echo (delay with damped feedback, the cosmic piece only) -> mix
 *   mix -> high-pass 85 Hz (no rumble) -> presence dip 2.5 kHz (while Tock speaks)
 *       -> high shelf -5 dB above 6 kHz (no harshness) -> output, and -> reverb send
 *
 * Pads follow the voice leading: a note common to two chords keeps sounding and
 * is gently re-breathed; other notes swell in (staggered, low to high) while the
 * old ones fade. No pitch glides, no node lives longer than its note: every
 * source is stopped and reported to `track` (the engine counts them).
 */
import { chordNotes, chordSeconds, midiHz, SCORES, secondsPerBeat, type BgmStyle, type Score, type ScoreChord } from './score.ts';

/** Levels at full (tuned on rendered files: about -24 dBFS RMS for the piece alone). */
const PAD_LEVEL = 0.11;
const PIANO_LEVEL = 0.2;
/** Soft: under 5% of the energy below 120 Hz (no rumble). */
const BASS_LEVEL = 0.035;
/** Seconds of scheduling ahead of the audio clock. */
const LOOKAHEAD = 0.6;

interface PadVoice {
  m: number;
  oscs: OscillatorNode[];
  gain: GainNode;
}

export class AmbientBed {
  readonly output: GainNode;
  readonly send: GainNode;
  /** The guide is explaining: only the core notes (set before a chord starts). */
  sparse = false;
  private readonly ctx: BaseAudioContext;
  private readonly track: (n: AudioScheduledSourceNode) => void;
  private readonly mix: GainNode;
  private readonly padBus: GainNode;
  private readonly padFilter: BiquadFilterNode;
  private readonly sweepDepth: GainNode;
  private readonly pianoBus: GainNode;
  private readonly bassBus: GainNode;
  private readonly echoIn: GainNode;
  private readonly echoWet: GainNode;
  private readonly presence: BiquadFilterNode;
  private readonly padWave: PeriodicWave;
  private readonly pianoWave: PeriodicWave;
  private readonly bassWave: PeriodicWave;
  private score: Score;
  private chordIdx = -1;
  private verse = 0;
  private nextChordAt = 0;
  private queue: { t: number; m: number; v: number }[] = [];
  private pads = new Map<number, PadVoice>();
  private bass: { osc: OscillatorNode; gain: GainNode } | null = null;
  private current: ScoreChord | null = null;

  constructor(ctx: BaseAudioContext, style: BgmStyle = 'cinematic', track: (n: AudioScheduledSourceNode) => void = () => {}) {
    this.ctx = ctx;
    this.track = track;
    this.score = SCORES[style];
    this.mix = ctx.createGain();
    // Pads: a gentle low-pass that breathes with a very slow sweep.
    this.padBus = ctx.createGain();
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.Q.value = 0.4;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.031;
    this.sweepDepth = ctx.createGain();
    sweep.connect(this.sweepDepth).connect(this.padFilter.frequency);
    sweep.start();
    this.padBus.connect(this.padFilter).connect(this.mix);
    this.pianoBus = ctx.createGain();
    this.pianoBus.connect(this.mix);
    this.bassBus = ctx.createGain();
    this.bassBus.connect(this.mix);
    // Echo for the stars: 0.62 s, damped feedback, quiet.
    this.echoIn = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.62;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.34;
    this.echoWet = ctx.createGain();
    this.echoWet.gain.value = 0;
    this.pianoBus.connect(this.echoIn);
    this.echoIn.connect(delay).connect(damp).connect(feedback).connect(delay);
    damp.connect(this.echoWet).connect(this.mix);
    // Tone: no rumble, room for the voice, no harsh top.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 85;
    hp.Q.value = 0.6;
    this.presence = ctx.createBiquadFilter();
    this.presence.type = 'peaking';
    this.presence.frequency.value = 2500;
    this.presence.Q.value = 0.8;
    this.presence.gain.value = 0;
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 6000;
    shelf.gain.value = -5;
    this.output = ctx.createGain();
    this.send = ctx.createGain();
    this.mix.connect(hp).connect(this.presence).connect(shelf);
    shelf.connect(this.output);
    shelf.connect(this.send);

    // Timbres: a warm pad (soft saw-like rolloff), a mellow piano (few, falling partials), a round bass.
    this.padWave = wave(ctx, [1, 0.45, 0.28, 0.16, 0.1, 0.06, 0.035]);
    this.pianoWave = wave(ctx, [1, 0.38, 0.17, 0.1, 0.05, 0.03]);
    this.bassWave = wave(ctx, [1, 0.22, 0.05]);
    this.applyStyle(ctx.currentTime);
  }

  get style(): BgmStyle {
    return this.score.style;
  }

  /** The chord being played ("Dmaj9"), its index and the verse, for the audition panel. */
  get position(): { chord: string; index: number; verse: number } {
    return { chord: this.current?.name ?? '-', index: this.chordIdx, verse: this.verse };
  }

  /** Change the piece: the old one fades out, the new one starts from its first chord. */
  setStyle(style: BgmStyle, at = this.ctx.currentTime): void {
    if (style === this.score.style) return;
    this.score = SCORES[style];
    for (const v of this.pads.values()) this.releasePad(v, at, 1.8);
    this.pads.clear();
    this.releaseBass(at, 1.5);
    this.queue = [];
    this.chordIdx = -1;
    this.verse = 0;
    this.nextChordAt = at + 0.6;
    this.applyStyle(at);
  }

  /** Tock is speaking: dip the voice's clarity band a little (down fast, back slowly). */
  setSpeaking(on: boolean, at = this.ctx.currentTime): void {
    this.presence.gain.setTargetAtTime(on ? -6 : 0, at, on ? 0.15 : 0.8);
  }

  /** Schedule what is due before `now` + LOOKAHEAD. Call often (every frame live; in steps offline). */
  update(now: number): void {
    if (this.nextChordAt === 0) this.nextChordAt = now + 0.1;
    while (this.nextChordAt < now + LOOKAHEAD) this.startChord(this.nextChordAt);
    const due = this.queue.filter((n) => n.t < now + LOOKAHEAD);
    if (due.length) {
      this.queue = this.queue.filter((n) => n.t >= now + LOOKAHEAD);
      for (const n of due) this.piano(n.m, n.v, Math.max(n.t, now));
    }
  }

  /** Stop everything at once (the context is going away). */
  stop(at = this.ctx.currentTime): void {
    for (const v of this.pads.values()) this.releasePad(v, at, 0.3);
    this.pads.clear();
    this.releaseBass(at, 0.3);
    this.queue = [];
  }

  // -------------------------------------------------------------------------

  /** Report a source to the engine, and free the nodes it fed once it has ended (nothing accumulates). */
  private own(node: AudioScheduledSourceNode, ...fed: AudioNode[]): void {
    this.track(node);
    const counted = node.onended;
    node.onended = (e) => {
      if (counted) counted.call(node, e);
      node.disconnect();
      for (const f of fed) f.disconnect();
    };
  }

  private applyStyle(at: number): void {
    const s = this.score;
    this.padFilter.frequency.setTargetAtTime(s.padCutoff, at, 1);
    this.sweepDepth.gain.setTargetAtTime(s.padSweep, at, 1);
    this.padBus.gain.setTargetAtTime(PAD_LEVEL * s.pad, at, 0.8);
    this.pianoBus.gain.setTargetAtTime(PIANO_LEVEL * s.piano, at, 0.5);
    this.bassBus.gain.setTargetAtTime(BASS_LEVEL * s.bass, at, 0.8);
    this.echoWet.gain.setTargetAtTime(s.echo ? 0.42 : 0, at, 0.5);
    this.echoIn.gain.setTargetAtTime(s.echo ? 1 : 0, at, 0.2);
    this.send.gain.setTargetAtTime(s.reverb, at, 1);
    this.output.gain.setTargetAtTime(s.gain, at, 0.8);
  }

  private startChord(t: number): void {
    const s = this.score;
    this.chordIdx++;
    if (this.chordIdx >= s.chords.length) {
      this.chordIdx = 0;
      this.verse++;
    }
    const ch = s.chords[this.chordIdx];
    this.current = ch;
    const dur = chordSeconds(s, ch);
    this.nextChordAt = t + dur;
    this.padChord(ch.pad, t);
    if (ch.bass !== null && s.bass > 0) this.bassNote(ch.bass, t, dur);
    else this.releaseBass(t, 2);
    const spb = secondsPerBeat(s);
    // A touch of human timing (fixed per note, not random): never quantised to the grid.
    for (const n of chordNotes(s, ch, this.verse, this.sparse)) {
      const lean = ((n.m * 7 + Math.round(n.b * 4)) % 5) * 0.008 - 0.016;
      this.queue.push({ t: t + n.b * spb + lean, m: n.m, v: n.v * (this.sparse ? 0.85 : 1) });
    }
  }

  private padChord(notes: number[], t: number): void {
    const s = this.score;
    const level = 1 / Math.sqrt(notes.length);
    // Old notes not in the new chord fade out; common notes stay and breathe; new notes swell in.
    for (const [m, v] of this.pads) {
      if (!notes.includes(m)) {
        this.releasePad(v, t, s.release);
        this.pads.delete(m);
      }
    }
    let k = 0;
    for (const m of notes) {
      const held = this.pads.get(m);
      if (held) {
        const g = held.gain.gain;
        g.cancelScheduledValues(t);
        g.setTargetAtTime(level * 0.72, t, 0.35);
        g.setTargetAtTime(level, t + 0.8, 1.2);
        continue;
      }
      const start = t + 0.16 * k++;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.setTargetAtTime(level, start, s.attack / 3);
      const oscs = [-6, 6].map((cents, j) => {
        const o = this.ctx.createOscillator();
        o.setPeriodicWave(this.padWave);
        o.frequency.value = midiHz(m);
        o.detune.value = cents;
        o.connect(gain);
        // (The second oscillator frees the note's gain when it ends.)
        if (j === 1) this.own(o, gain);
        else this.own(o);
        o.start(start);
        return o;
      });
      gain.connect(this.padBus);
      this.pads.set(m, { m, oscs, gain });
    }
  }

  private releasePad(v: PadVoice, t: number, seconds: number): void {
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(0, t, seconds / 3);
    for (const o of v.oscs) o.stop(t + seconds * 1.7);
  }

  private bassNote(m: number, t: number, dur: number): void {
    this.releaseBass(t, 1.6);
    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.bassWave);
    osc.frequency.value = midiHz(m);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.setTargetAtTime(1, t, 0.45);
    // Not a drone: it settles lower within the chord.
    gain.gain.setTargetAtTime(0.55, t + 1.5, dur / 2);
    osc.connect(gain).connect(this.bassBus);
    this.own(osc, gain);
    osc.start(t);
    this.bass = { osc, gain };
  }

  private releaseBass(t: number, seconds: number): void {
    if (!this.bass) return;
    const { osc, gain } = this.bass;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0, t, seconds / 3);
    osc.stop(t + seconds * 1.7);
    this.bass = null;
  }

  /** A soft piano-like note: quick attack, a bright start that mellows, a long natural decay. */
  private piano(m: number, v: number, t: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.pianoWave);
    osc.frequency.value = midiHz(m);
    osc.detune.value = ((m * 13) % 7) - 3; // a hair of inharmonic life, fixed per pitch
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.3;
    filter.frequency.setValueAtTime(1400 + 2400 * v, t);
    filter.frequency.setTargetAtTime(650 + Math.max(0, m - 60) * 18, t + 0.01, 0.45);
    const g = ctx.createGain();
    const peak = v;
    // Lower notes ring longer, higher ones shorter (as on a piano).
    const tail = Math.min(1.9, Math.max(0.7, 1.6 - (m - 62) * 0.035));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.setTargetAtTime(peak * 0.42, t + 0.01, 0.2);
    g.gain.setTargetAtTime(0, t + 0.5, tail);
    osc.connect(filter).connect(g).connect(this.pianoBus);
    this.own(osc, filter, g);
    osc.start(t);
    osc.stop(t + 0.5 + tail * 6);
  }
}

function wave(ctx: BaseAudioContext, partials: number[]): PeriodicWave {
  const real = new Float32Array(partials.length + 1);
  const imag = new Float32Array(partials.length + 1);
  partials.forEach((a, k) => (imag[k + 1] = a));
  return ctx.createPeriodicWave(real, imag);
}
