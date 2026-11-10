/** The hall's impulse response, generated (no files): shared by the live engine and offline renders. */

/** Stereo noise burst with an exponential tail: a soft, airy hall. */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
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
