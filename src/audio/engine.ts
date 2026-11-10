/**
 * Sound engine (Web Audio, fully procedural).
 *
 * Graph:
 *   per currency:  pluck notes + pad -> lowpass -> voiceGain -> PannerNode(HRTF) -> bus
 *                                                       \-> reverb send
 *   global:        drone chord (tension follows turbulence) -> bus
 *   ambient bed:   two chord layers (crossfaded) + soft bells -> lowpass -> ambient -> master
 *   effects:       gong, shimmer, chimes, the tunnel, blips -> fx -> master
 *   bus, ambient, fx -> reverb send -> reverb (generated impulse) -> wet -> master
 *   master -> compressor -> speakers
 *
 * Modes (src/audio/mix.ts): how much of the data music, the ambient bed and
 * the reverb sound while choosing a year, in the tunnel, while the year
 * flows, while the guide explains, and in the summary. The ambient bed moves
 * on the audio clock (its own chord changes), so the music never freezes
 * when the history clock stands still. The voice ducks the music bus, the
 * bed and the reverb return together (not the effects: a gong stays a gong).
 *
 * We share three.js' AudioContext so the AudioListener that IWSDK attaches to
 * the player's head drives our PannerNodes: each currency is heard from its
 * own direction (spread west to east by the chart band, see config VOICES).
 *
 * Musical rules (see brief section 5):
 *   strength change -> pitch (quantized to D major pentatonic)
 *   speed of change -> note density and loudness
 *   market turbulence -> drone tension, filter brightness, reverb
 *   fixed-rate era -> only the soft pads sound; plucks appear as markets move
 * Comfort: notes start on a gentle 8th-note grid, levels ramp, and a
 * compressor catches peaks so loudness never jumps.
 */
import { AudioContext as ThreeAudioContext } from '@iwsdk/core';
import type { TimbreId } from '../config.js';
import { CHORD_S, CROSSFADE_S, DUCK, FADE, bellDegree, chordAt, duckLevel, mixOf, smooth, type SoundMode } from './mix.js';
import { NoteQueue } from './note-queue.js';
import { degreeToHz } from './scale.js';
import { TIMBRES, type Timbre } from './timbres.js';

/** Eighth notes at 84 BPM: max ~2.8 notes/s per voice (also keeps lights < 3 Hz). */
const PULSE_S = 60 / 84 / 2;
const LOOKAHEAD_S = 0.06;
/** Volatility at which a voice plays about 0.6 notes per second. */
const VOL_REF = 0.006;
/** The ambient bed's level at full (each of its four voices, before the filter). */
const AMBIENT_LEVEL = 0.05;
/** Relative loudness of the bed's voices: bass, then the three upper voices. */
const AMBIENT_VOICES = [0.9, 0.6, 0.5, 0.42];

export interface VoiceInput {
  alive: boolean;
  /** Scale degree for the current strength (already includes the register). */
  degree: number;
  /** Smoothed weekly |change| of this currency. */
  vol: number;
}

interface Voice {
  timbre: Timbre;
  wave: PeriodicWave;
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
  padOsc: OscillatorNode;
  padGain: GainNode;
  padDegree: number;
  alive: boolean;
  phase: number;
}

export type NoteListener = (slotIndex: number, velocity: number, when: number) => void;

const MIX_START = mixOf('selection');

export class SoundEngine {
  readonly ctx: AudioContext;
  private master!: GainNode;
  private bus!: GainNode;
  private reverbSend!: GainNode;
  private reverbWet!: GainNode;
  private voices: Voice[] = [];
  private droneOscs: OscillatorNode[] = [];
  private droneGains: GainNode[] = [];
  private droneFilter!: BiquadFilterNode;
  private nextPulse = 0;
  private built = false;
  private solo = -1;
  private noteListener: NoteListener | null = null;
  /** Booked notes waiting until they are actually heard (see dispatchDue). */
  private readonly pending = new NoteQueue();
  private readonly emit = (i: number, v: number, when: number) => this.noteListener?.(i, v, when);
  private suspendTimer: number | undefined;
  private fx!: GainNode;
  private ambient!: GainNode;
  private layers: { gain: GainNode; oscs: OscillatorNode[] }[] = [];
  private activeLayer = 0;
  private chordStep = -1;
  private nextChordAt = 0;
  private bellAt = 0;
  private bellCount = 0;
  private mode: SoundMode = 'selection';
  private beforePause: Exclude<SoundMode, 'paused'> = 'selection';
  /** Smoothed levels (JS side, so mode changes and the duck never jump). */
  private readonly level = { drone: MIX_START.drone, pad: MIX_START.pad, ambient: MIX_START.ambient, reverb: MIX_START.reverb, duck: 1 };
  private lastUpdate = -1;
  private speaking = false;
  private quietSince = -1e9;
  private live = 0;
  /** Dev builds: level meters on the data music, the bed and the output. */
  private meters: { bus: AnalyserNode; bed: AnalyserNode; out: AnalyserNode } | null = null;
  paused = false;
  /** Number of notes scheduled so far (dev diagnostics). */
  noteCount = 0;

  constructor(private readonly timbreIds: TimbreId[]) {
    this.ctx = ThreeAudioContext.getContext() as AudioContext;
  }

  /**
   * Listen for notes. The callback fires when a note becomes audible (its
   * scheduled context time, plus output latency), not when it is booked, so
   * lights answering a note stay in sync even for notes booked seconds ahead.
   */
  onNote(listener: NoteListener): void {
    this.noteListener = listener;
  }

  /** Release notes whose start time has been reached. Called every frame. */
  private dispatchDue(): void {
    if (!this.built || this.pending.size === 0) return;
    const latency = Math.min(0.2, Math.max(0, this.ctx.outputLatency || this.ctx.baseLatency || 0));
    this.pending.drain(this.ctx.currentTime - latency, this.emit);
  }

  /** Must be called from a user gesture (click/pinch/XR entry) at least once. */
  async unlock(): Promise<void> {
    if (!this.built) this.build();
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* resumed later by the next gesture */
      }
    }
  }

  get running(): boolean {
    return this.built && this.ctx.state === 'running';
  }

  private build(): void {
    const ctx = this.ctx;
    this.built = true;

    // Output chain: master (fades/pause) -> gentle compressor -> speakers.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);

    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(this.master);

    // Reverb from a generated impulse response (no external files).
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 3.4, 0.85);
    this.reverbSend = ctx.createGain();
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0.35;
    this.reverbSend.connect(convolver);
    convolver.connect(this.reverbWet);
    this.reverbWet.connect(this.master);

    // Effects (gong, shimmer, chimes, tunnel, blips): their own bus, not ducked by the voice.
    this.fx = ctx.createGain();
    this.fx.gain.value = 1;
    this.fx.connect(this.master);

    // Ambient bed: two layers of four voices; a new chord fades in on the silent layer while the
    // other fades out (no pitch ever glides). A slow wobble on the filter keeps it breathing.
    const bedFilter = ctx.createBiquadFilter();
    bedFilter.type = 'lowpass';
    bedFilter.frequency.value = 1100;
    bedFilter.Q.value = 0.3;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 0.045;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 320;
    wobble.connect(wobbleDepth).connect(bedFilter.frequency);
    wobble.start();
    this.ambient = ctx.createGain();
    this.ambient.gain.value = 0;
    bedFilter.connect(this.ambient);
    this.ambient.connect(this.master);
    const bedSend = ctx.createGain();
    bedSend.gain.value = 0.5;
    this.ambient.connect(bedSend).connect(this.reverbSend);
    const bedWave = ctx.createPeriodicWave(new Float32Array([0, 1, 0.22, 0.07, 0.025]), new Float32Array(5));
    for (let l = 0; l < 2; l++) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(bedFilter);
      const oscs = AMBIENT_VOICES.map((level, k) => {
        const osc = ctx.createOscillator();
        osc.setPeriodicWave(bedWave);
        osc.detune.value = (k % 2 ? 1 : -1) * 3 * (l + 1); // a touch of width between the layers
        const g = ctx.createGain();
        g.gain.value = level * AMBIENT_LEVEL;
        osc.connect(g).connect(gain);
        osc.start();
        return osc;
      });
      this.layers.push({ gain, oscs });
    }

    // Drone: D2 + A2 always, F#3 (sweet) fading to E3/B3 (tense) with turbulence.
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 380;
    this.droneFilter.Q.value = 0.5;
    this.droneFilter.connect(this.bus);
    this.droneFilter.connect(this.reverbSend);
    const droneWave = ctx.createPeriodicWave(new Float32Array([0, 1, 0.35, 0.12, 0.05]), new Float32Array(5));
    for (const degree of [-5, -2, 2, 1, 4]) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(droneWave);
      osc.frequency.value = degreeToHz(degree);
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(this.droneFilter);
      osc.start();
      this.droneOscs.push(osc);
      this.droneGains.push(g);
    }

    // One spatial voice per currency.
    for (const id of this.timbreIds) {
      const timbre = TIMBRES[id];
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = timbre.cutoff;
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      const panner = new PannerNode(ctx, {
        panningModel: 'HRTF',
        distanceModel: 'inverse',
        // Voices sit about 1.2 m away, by the chart band (see config VOICES).
        refDistance: 1.2,
        rolloffFactor: 0.6,
        maxDistance: 20,
      });
      filter.connect(gain);
      gain.connect(panner).connect(this.bus);
      gain.connect(this.reverbSend);

      const padOsc = ctx.createOscillator();
      padOsc.setPeriodicWave(makeWave(ctx, timbre.pad));
      const padGain = ctx.createGain();
      padGain.gain.value = 0;
      padOsc.connect(padGain).connect(filter);
      padOsc.start();

      this.voices.push({
        timbre,
        wave: makeWave(ctx, timbre.partials),
        filter,
        gain,
        panner,
        padOsc,
        padGain,
        padDegree: NaN,
        alive: false,
        // Stagger voices so they never start in lockstep.
        phase: Math.random() * 0.8,
      });
    }
    this.nextPulse = ctx.currentTime + PULSE_S;
    if (import.meta.env?.DEV) {
      const meter = (from: AudioNode) => {
        const a = ctx.createAnalyser();
        a.fftSize = 2048;
        from.connect(a);
        return a;
      };
      this.meters = { bus: meter(this.bus), bed: meter(this.ambient), out: meter(this.master) };
    }
  }

  /** Dev diagnostics: RMS levels in dB of the data music, the ambient bed and the output; the bed's chord. */
  meterText(): string {
    if (!this.meters) return '-';
    const buf = new Float32Array(2048);
    const db = (a: AnalyserNode) => {
      a.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const x of buf) sum += x * x;
      const rms = Math.sqrt(sum / buf.length);
      return rms > 1e-6 ? (20 * Math.log10(rms)).toFixed(0) : '-inf';
    };
    return `data:${db(this.meters.bus)}dB bed:${db(this.meters.bed)}dB out:${db(this.meters.out)}dB chord:${this.chordStep}`;
  }

  /** Update a voice's 3D position (world/listener space, meters). */
  setVoicePosition(i: number, x: number, y: number, z: number): void {
    const v = this.voices[i];
    if (!v) return;
    const t = this.ctx.currentTime;
    v.panner.positionX.setTargetAtTime(x, t, 0.05);
    v.panner.positionY.setTargetAtTime(y, t, 0.05);
    v.panner.positionZ.setTargetAtTime(z, t, 0.05);
  }

  /**
   * Called every frame while the time-lapse plays.
   * @param inputs per-voice state at the current moment
   * @param turbulence market-wide 0..1
   * @param floatBlend 0 during the fixed-rate era, 1 once rates float
   * @param flowing false while paused/ended (no new notes)
   */
  update(inputs: VoiceInput[], turbulence: number, floatBlend: number, flowing: boolean): void {
    this.dispatchDue();
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const u = turbulence;
    const lv = this.mixLevels(now);

    // Drone: calm -> tense, warm -> bright, spacious -> washed (scaled by the mode).
    const droneLevel = 0.045 * (1 - 0.3 * floatBlend) * lv.drone;
    const tense = Math.min(1, u * 1.4);
    const targets = [droneLevel, droneLevel * 0.8, droneLevel * 0.55 * (1 - tense), droneLevel * 0.5 * tense, droneLevel * 0.4 * tense];
    this.droneGains.forEach((g, i) => g.gain.setTargetAtTime(targets[i], now, 0.5));
    this.droneFilter.frequency.setTargetAtTime(320 + 1400 * u, now, 1.5);
    // The reverb return follows the mode and the voice too: no tail left ringing under the guide.
    this.reverbWet.gain.setTargetAtTime((0.32 + 0.2 * u) * lv.reverb * lv.duck, now, 0.25);
    this.bus.gain.setTargetAtTime(0.9 * lv.duck, now, 0.12);
    this.ambient.gain.setTargetAtTime(lv.ambient * lv.duck, now, 0.12);
    this.updateBed(now);

    const padLevel = 0.03 * (1 - 0.55 * floatBlend) * lv.pad;
    inputs.forEach((inp, i) => {
      const v = this.voices[i];
      if (!v) return;
      // Pads: one octave below the voice, gliding to each new scale step.
      if (inp.alive && inp.degree !== v.padDegree) {
        v.padOsc.frequency.setTargetAtTime(degreeToHz(inp.degree - 5), now, 0.25);
        v.padDegree = inp.degree;
      }
      v.padGain.gain.setTargetAtTime(inp.alive ? padLevel : 0, now, inp.alive && !v.alive ? 1.2 : 0.3);
      if (inp.alive && !v.alive && flowing) this.scheduleNote(i, inp.degree, 0.35, now + 0.05, 0.3);
      v.alive = inp.alive;
      v.filter.frequency.setTargetAtTime(v.timbre.cutoff * (0.7 + 0.7 * u), now, 0.8);
    });

    // Pulse grid: each voice accumulates "intent to play" from its volatility
    // and fires on the next grid tick once it has accumulated a full note.
    if (this.nextPulse < now) this.nextPulse = now + 0.02;
    while (this.nextPulse < now + LOOKAHEAD_S) {
      const when = this.nextPulse;
      if (flowing) {
        inputs.forEach((inp, i) => {
          const v = this.voices[i];
          if (!v || !inp.alive) return;
          const rate = Math.min(2.6, 0.6 * Math.pow(inp.vol / VOL_REF, 1.3));
          v.phase += rate * PULSE_S;
          if (v.phase >= 1) {
            v.phase -= Math.floor(v.phase);
            const velocity = 0.35 + 0.65 * Math.tanh(inp.vol / 0.015);
            this.scheduleNote(i, inp.degree, velocity, when);
          }
        });
      }
      this.nextPulse += PULSE_S;
    }
  }

  /**
   * The sound mode (src/audio/mix.ts): set every frame by the experience from its
   * phase and the guide's state; only a change does anything.
   */
  setMode(mode: SoundMode): void {
    if (mode === this.mode) return;
    if (this.mode !== 'paused') this.beforePause = this.mode;
    this.mode = mode;
  }

  get currentMode(): SoundMode {
    return this.mode;
  }

  /** Short-lived sound nodes still playing (notes, effects): steady over a long session. */
  get activeNodes(): number {
    return this.live;
  }

  /** The smoothed mix at `now`: the mode's levels and the voice's duck, never jumping. */
  private mixLevels(now: number): { drone: number; pad: number; ambient: number; reverb: number; duck: number } {
    const dt = this.lastUpdate < 0 ? 0 : Math.min(0.25, Math.max(0, now - this.lastUpdate));
    this.lastUpdate = now;
    const m = mixOf(this.mode, this.beforePause);
    const l = this.level;
    l.drone = smooth(l.drone, m.drone, dt, FADE.dataOut, FADE.dataIn);
    l.pad = smooth(l.pad, m.pad, dt, FADE.dataOut, FADE.dataIn);
    l.reverb = smooth(l.reverb, m.reverb, dt, FADE.dataOut, FADE.dataIn);
    l.ambient = smooth(l.ambient, m.ambient, dt, FADE.ambientOut, FADE.ambientIn);
    l.duck = smooth(l.duck, duckLevel(this.speaking, now, this.quietSince), dt, DUCK.attackS, DUCK.releaseS);
    return l;
  }

  /** The ambient bed: a new chord every CHORD_S on the audio clock (it moves while history stands still). */
  private updateBed(now: number): void {
    if (now >= this.nextChordAt) {
      this.chordStep++;
      this.nextChordAt = now + CHORD_S;
      const chord = chordAt(this.chordStep);
      const fresh = this.layers[1 - this.activeLayer];
      const old = this.layers[this.activeLayer];
      this.activeLayer = 1 - this.activeLayer;
      // The new layer is silent: set its pitches outright, then fade it in over the old one.
      fresh.oscs.forEach((o, k) => o.frequency.setValueAtTime(degreeToHz(chord[k]), now));
      for (const [layer, to, s] of [[fresh, 1, CROSSFADE_S], [old, 0, CROSSFADE_S + 0.6]] as const) {
        const g = layer.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(to, now + s);
      }
    }
    // Sparse soft bells on the chord, only while nothing is being explained and the bed is up.
    const m = mixOf(this.mode, this.beforePause);
    if (m.bells && this.level.ambient > 0.5 && !this.speaking && now >= this.bellAt) {
      this.bellAt = now + 3.5 + Math.random() * 3;
      this.bell(bellDegree(this.chordStep, this.bellCount++), now + 0.05);
    } else if (!m.bells && this.bellAt < now + 2) this.bellAt = now + 2;
  }

  private bell(degree: number, t: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = degreeToHz(degree);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.011, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    osc.connect(g).connect(this.ambient);
    this.track(osc);
    osc.start(t);
    osc.stop(t + 3.6);
  }

  /** Count a short-lived source until it has played (see activeNodes). */
  private track(node: AudioScheduledSourceNode): void {
    this.live++;
    node.onended = () => {
      this.live--;
      node.disconnect();
    };
  }

  /** Schedule one pluck/bell note on voice i. */
  scheduleNote(i: number, degree: number, velocity: number, when: number, extraAttack = 0): void {
    const v = this.voices[i];
    if (!v || !this.running) return;
    const ctx = this.ctx;
    const tb = v.timbre;
    const f = degreeToHz(degree);
    const peak = 0.16 * tb.gain * velocity;
    const attack = tb.attack + extraAttack;
    const end = when + attack + tb.decay;

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(v.wave);
    osc.frequency.value = f;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, when + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(env).connect(v.filter);

    if (tb.fmIndex > 0) {
      const mod = ctx.createOscillator();
      mod.frequency.value = f * tb.fmRatio;
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(f * tb.fmIndex, when);
      modGain.gain.exponentialRampToValueAtTime(f * tb.fmIndex * 0.02 + 0.01, when + tb.fmDecay + 0.01);
      mod.connect(modGain).connect(osc.frequency);
      this.track(mod);
      mod.start(when);
      mod.stop(end + 0.05);
    }
    this.track(osc);
    osc.start(when);
    osc.stop(end + 0.05);
    this.noteCount++;
    this.pending.push(i, velocity, when);
  }

  /** Low gong for major historical moments (non-positional, wrapped in reverb). */
  gong(): void {
    if (!this.running) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    for (const [degree, level] of [[-5, 0.11], [-2, 0.06], [2, 0.03]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = degreeToHz(degree);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
      osc.connect(g);
      g.connect(this.fx);
      g.connect(this.reverbSend);
      this.track(osc);
      osc.start(t);
      osc.stop(t + 6.1);
    }
  }

  /** A Historical Portal opens: a slow, airy three-note shimmer (very soft). */
  shimmer(): void {
    if (!this.running) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    [10, 12, 14].forEach((degree, k) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = degreeToHz(degree);
      const g = ctx.createGain();
      const s = t + k * 0.32;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.014, s + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 3.2);
      osc.connect(g);
      g.connect(this.fx);
      g.connect(this.reverbSend);
      this.track(osc);
      osc.start(s);
      osc.stop(s + 3.3);
    });
  }

  /** Soft high chime marking each new decade: an audio-only sense of time. */
  decadeChime(): void {
    if (!this.running) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    [15, 17].forEach((degree, k) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = degreeToHz(degree);
      const g = ctx.createGain();
      const s = t + k * 0.18;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.022, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 1.4);
      osc.connect(g);
      g.connect(this.fx);
      g.connect(this.reverbSend);
      this.track(osc);
      osc.start(s);
      osc.stop(s + 1.5);
    });
  }

  /** Bring one voice forward (or -1 to clear). */
  setSolo(index: number): void {
    this.solo = index;
    if (!this.built) return;
    const t = this.ctx.currentTime;
    this.voices.forEach((v, i) => {
      const target = index < 0 ? 1 : i === index ? 1.9 : 0.16;
      v.gain.gain.setTargetAtTime(target, t, 0.25);
    });
  }

  get soloIndex(): number {
    return this.solo;
  }

  /** Smooth fade in/out; the context is suspended while paused to save power. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!this.built) return;
    const t = this.ctx.currentTime;
    window.clearTimeout(this.suspendTimer);
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    if (paused) {
      this.master.gain.linearRampToValueAtTime(0, t + 0.5);
      this.suspendTimer = window.setTimeout(() => void this.ctx.suspend(), 650);
    } else {
      void this.ctx.resume();
      this.master.gain.linearRampToValueAtTime(0.85, t + 0.9);
    }
  }

  /**
   * Narration ducking: while the guide speaks, the music bus, the ambient bed
   * and the reverb return step back so the voice stays clear. They come back
   * only after a short hold (a pause between two sentences does not let the
   * music swell) and slowly (see DUCK in mix.ts; applied in update).
   */
  duck(on: boolean): void {
    if (this.speaking && !on) this.quietSince = this.built ? this.ctx.currentTime : 0;
    this.speaking = on;
  }

  /** A short, soft two-note blip: the guide robot's "beep" and button feedback. */
  blip(up = true): void {
    if (!this.running) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    (up ? [9, 13] : [13, 9]).forEach((degree, k) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = degreeToHz(degree);
      const g = ctx.createGain();
      const s = t + k * 0.07;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.03, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.22);
      osc.connect(g);
      g.connect(this.fx);
      this.track(osc);
      osc.start(s);
      osc.stop(s + 0.25);
    });
  }

  /**
   * The time machine: a filtered-noise rush that swells and settles, under a
   * slow falling glide (time running backward), then a soft arrival shimmer.
   * Gentle levels; `calm` makes it quieter and smoother.
   */
  warp(seconds: number, calm = false): void {
    if (!this.running) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const end = t + seconds;
    const len = Math.floor(ctx.sampleRate * (seconds + 0.5));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(240, t);
    band.frequency.exponentialRampToValueAtTime(calm ? 900 : 2200, t + seconds * 0.55);
    band.frequency.exponentialRampToValueAtTime(320, end);
    const g = ctx.createGain();
    const peak = calm ? 0.05 : 0.09;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + seconds * 0.35);
    g.gain.linearRampToValueAtTime(peak * 0.8, t + seconds * 0.75);
    g.gain.linearRampToValueAtTime(0, end + 0.3);
    noise.connect(band);
    band.connect(g);
    g.connect(this.fx);
    g.connect(this.reverbSend);
    this.track(noise);
    noise.start(t);
    noise.stop(end + 0.4);
    for (const [from, to, level] of [[14, 2, 0.02], [9, -3, 0.016]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(degreeToHz(from), t);
      osc.frequency.exponentialRampToValueAtTime(degreeToHz(to), end);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(level, t + 0.4);
      og.gain.linearRampToValueAtTime(0, end + 0.2);
      osc.connect(og);
      og.connect(this.fx);
      og.connect(this.reverbSend);
      this.track(osc);
      osc.start(t);
      osc.stop(end + 0.3);
    }
  }

  /** Quick dip used when jumping between chapters. */
  dip(): void {
    if (!this.running || this.paused) return;
    const t = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.15, t + 0.15);
    g.linearRampToValueAtTime(0.85, t + 1.0);
  }
}

function makeWave(ctx: AudioContext, partials: number[]): PeriodicWave {
  const real = new Float32Array(partials.length + 1);
  const imag = new Float32Array(partials.length + 1);
  partials.forEach((a, k) => (imag[k + 1] = a));
  return ctx.createPeriodicWave(real, imag);
}

/** Stereo noise burst with an exponential tail: a soft, airy hall. */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      // One-pole low-pass on the noise darkens the tail (less harsh).
      lp += 0.35 * (Math.random() * 2 - 1 - lp);
      data[i] = lp * Math.exp(-t / decay) * (t < 0.01 ? t / 0.01 : 1);
    }
  }
  return buf;
}
