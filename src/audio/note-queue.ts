/**
 * Holds notes that are scheduled in the AudioContext's future and releases
 * them when they actually become audible, so the light that answers a note
 * (the line's head glow and spark) appears with the sound, not when it was booked.
 *
 * Pure (no Web Audio) so it can be unit tested. Fixed capacity, no
 * allocations per note.
 */
export class NoteQueue {
  private readonly slot: Int16Array;
  private readonly vel: Float32Array;
  private readonly when: Float64Array;
  private n = 0;

  constructor(capacity = 128) {
    this.slot = new Int16Array(capacity);
    this.vel = new Float32Array(capacity);
    this.when = new Float64Array(capacity);
  }

  get size(): number {
    return this.n;
  }

  /** Queue a note heard at context time `when`. Drops the oldest if full. */
  push(slotIndex: number, velocity: number, when: number): void {
    if (this.n === this.slot.length) this.removeAt(0);
    this.slot[this.n] = slotIndex;
    this.vel[this.n] = velocity;
    this.when[this.n] = when;
    this.n++;
  }

  /** Call `fn` for (and remove) every note whose time is <= now, in time order. */
  drain(now: number, fn: (slotIndex: number, velocity: number, when: number) => void): void {
    while (this.n > 0) {
      let k = -1;
      let best = Infinity;
      for (let i = 0; i < this.n; i++) {
        if (this.when[i] <= now && this.when[i] < best) {
          best = this.when[i];
          k = i;
        }
      }
      if (k < 0) return;
      const s = this.slot[k];
      const v = this.vel[k];
      const w = this.when[k];
      this.removeAt(k);
      fn(s, v, w);
    }
  }

  clear(): void {
    this.n = 0;
  }

  private removeAt(k: number): void {
    for (let i = k + 1; i < this.n; i++) {
      this.slot[i - 1] = this.slot[i];
      this.vel[i - 1] = this.vel[i];
      this.when[i - 1] = this.when[i];
    }
    this.n--;
  }
}
