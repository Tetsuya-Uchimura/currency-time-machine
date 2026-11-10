/**
 * Preview files of the ambient pieces: renders a piece offline (faster than
 * real time, no sound card), with the app's own bed, hall and compressor, and
 * encodes a WAV to listen to anywhere.
 *
 * Scenario (about 48 s): the selection screen (the full piece) for 18 s, then
 * the guide explaining: the bed a little lower, only its core notes, and a
 * voice's duck as it would be (speaking 6 s, a 1.2 s pause, again; the music
 * dips fast, holds through the pause, comes back slowly; the voice's band is
 * dipped). The voice itself is not in the file (the browser's speech cannot be
 * rendered offline): the audition panel's narration test plays it live.
 */
import { AmbientBed } from './bed.ts';
import { makeImpulse } from './impulse.ts';
import { DUCK, MIX } from './mix.ts';
import type { BgmStyle } from './score.ts';

export interface RenderResult {
  style: BgmStyle;
  seconds: number;
  wav: Blob;
  /** Peak and RMS of the whole file (dBFS). */
  peakDb: number;
  rmsDb: number;
  /** RMS of the selection part and of the guide part (dBFS). */
  selectionRmsDb: number;
  guideRmsDb: number;
  /** Chords in order, with their start (s). */
  chords: { t: number; name: string }[];
}

const SR = 44100;
/** The app's level for the ambient music (engine.ts AMBIENT_LEVEL) and master. */
const AMBIENT_LEVEL = 0.25;
const MASTER = 0.85;

export async function renderPreview(style: BgmStyle, seconds = 48, guideFrom = 18): Promise<RenderResult> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.01;
  comp.release.value = 0.3;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(comp);
  const amb = ctx.createGain();
  amb.gain.value = AMBIENT_LEVEL * MIX.selection.ambient;
  amb.connect(master);
  const hall = ctx.createConvolver();
  hall.buffer = makeImpulse(ctx, 3.4, 0.85);
  const wet = ctx.createGain();
  wet.gain.value = 0.32 * MIX.selection.reverb;
  hall.connect(wet).connect(master);
  const bed = new AmbientBed(ctx, style);
  bed.output.connect(amb);
  bed.send.connect(hall);

  const chords: { t: number; name: string }[] = [];
  let speaking = false;
  let lastChord = -1;
  for (let t = 0; t < seconds; t += 0.05) {
    const guide = t >= guideFrom;
    if (guide && t - 0.05 < guideFrom) {
      amb.gain.setTargetAtTime(AMBIENT_LEVEL * MIX.guide.ambient, t, 1.6);
      wet.gain.setTargetAtTime(0.32 * MIX.guide.reverb, t, 1);
    }
    const now = guide && (t - guideFrom) % 7.2 < 6;
    if (now !== speaking) {
      speaking = now;
      bed.setSpeaking(now, t);
      const base = AMBIENT_LEVEL * MIX.guide.ambient;
      if (now) amb.gain.setTargetAtTime(base * DUCK.level, t, DUCK.attackS);
      else amb.gain.setTargetAtTime(base, t + DUCK.holdS, DUCK.releaseS);
    }
    bed.sparse = guide;
    bed.update(t);
    const p = bed.position;
    const key = p.index + p.verse * 1000;
    if (key !== lastChord) {
      lastChord = key;
      chords.push({ t: Math.round(t * 10) / 10, name: p.chord });
    }
  }
  const buf = await ctx.startRendering();
  const stats = (from: number, to: number) => {
    let peak = 0;
    let sum = 0;
    let n = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = Math.floor(from * SR); i < Math.min(d.length, Math.floor(to * SR)); i++) {
        const x = d[i];
        peak = Math.max(peak, Math.abs(x));
        sum += x * x;
        n++;
      }
    }
    const db = (x: number) => (x > 1e-9 ? 20 * Math.log10(x) : -120);
    return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / Math.max(1, n))) };
  };
  const all = stats(0, seconds);
  return {
    style,
    seconds,
    wav: encodeWav(buf),
    peakDb: round1(all.peakDb),
    rmsDb: round1(all.rmsDb),
    selectionRmsDb: round1(stats(4, guideFrom).rmsDb),
    guideRmsDb: round1(stats(guideFrom + 2, seconds).rmsDb),
    chords,
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** 16-bit PCM WAV (interleaved), with a little headroom clip guard. */
export function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  data.setUint32(4, 36 + len * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true);
  data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true);
  data.setUint16(34, 16, true);
  str(36, 'data');
  data.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, k) => buf.getChannelData(k));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let k = 0; k < ch; k++) {
      const x = Math.max(-1, Math.min(1, chans[k][i]));
      data.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([data.buffer], { type: 'audio/wav' });
}
