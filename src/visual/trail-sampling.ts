/**
 * Pure time-series math for the light trails (no three.js, no imports), so it
 * can be unit tested with node:test (see tests/trails.test.ts).
 *
 * Used by the Multi-Currency Timeline (src/visual/multi-currency-chart.ts).
 * A line shows a fixed window of history ending at the playback head:
 *
 *     age 1 (left end) = head - windowWeeks      age 0 (right end) = head
 *
 * It is sampled straight from the weekly data every frame, never recorded
 * frame by frame, so the time span on screen is the same at any playback
 * speed or frame rate, and a jump shows the right history immediately.
 *
 * Vertices sit exactly on the weekly data points (plus one at each end), so the
 * drawn shape IS the weekly series and it translates rigidly to the left as the
 * head advances: no shimmer, no invented in-between values.
 */

/** Optional "today" point after the last weekly sample (live rate). */
export interface TrailTail {
  /** Fractional week index of the latest rate (>= the last weekly index). */
  index: number;
  /** Strength at that point (same units as the series). */
  value: number;
}

/** Output buffers, allocated once and reused every frame. */
export interface TrailSamples {
  /** Number of vertices written. */
  count: number;
  /** Week index of each vertex (clamped to the first data week). */
  t: Float64Array;
  /** 0 at the head, 1 at the far (old) end. */
  age: Float32Array;
  /** Series value at the vertex. */
  value: Float32Array;
  /** 1 where real data exists, 0 before the currency's first week. */
  valid: Uint8Array;
}

/** Most vertices a window can need: tail + every whole week inside + head. */
export function maxTrailPoints(windowWeeks: number): number {
  return Math.ceil(windowWeeks) + 2;
}

export function createSamples(windowWeeks: number): TrailSamples {
  const n = maxTrailPoints(windowWeeks);
  return { count: 0, t: new Float64Array(n), age: new Float32Array(n), value: new Float32Array(n), valid: new Uint8Array(n) };
}

/**
 * Series value at fractional week t: linear between weekly samples, clamped
 * at the ends. With a tail, values after the last weekly sample run straight
 * to the tail point (two real observations, nothing in between is invented);
 * a tail on the last week itself replaces that week's value.
 */
export function valueAt(series: ArrayLike<number>, t: number, tail?: TrailTail | null): number {
  const last = series.length - 1;
  if (tail) {
    const a = tail.index > last ? last : last - 1;
    if (t > a) {
      const span = Math.max(1e-9, Math.max(tail.index, last) - a);
      const f = Math.min(1, (t - a) / span);
      return series[a] + (tail.value - series[a]) * f;
    }
  }
  if (t <= 0) return series[0];
  if (t >= last) return series[last];
  const i = Math.floor(t);
  const f = t - i;
  return series[i] + (series[i + 1] - series[i]) * f;
}

/**
 * Fill `out` with the window [head - windowWeeks, head] of `series`.
 * Weeks before `first` (no data yet) are clamped onto the first week and
 * marked invalid, so they collapse to nothing when drawn.
 */
export function sampleTrail(
  series: ArrayLike<number>,
  first: number,
  head: number,
  windowWeeks: number,
  out: TrailSamples,
  tail?: TrailTail | null,
): number {
  const start = head - windowWeeks;
  let n = 0;
  const push = (t: number) => {
    const valid = t >= first - 1e-9;
    const tc = valid ? t : first;
    out.t[n] = tc;
    out.age[n] = Math.min(1, Math.max(0, (head - tc) / windowWeeks));
    out.value[n] = valueAt(series, tc, tail);
    out.valid[n] = valid && head >= first ? 1 : 0;
    n++;
  };
  // Oldest first (left to right).
  push(start);
  for (let w = Math.floor(start) + 1; w < head - 1e-6; w++) push(w);
  push(head);
  out.count = n;
  return n;
}

/** Range of the valid values in a sampled window (null if none). */
export function validRange(s: TrailSamples): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < s.count; k++) {
    if (!s.valid[k]) continue;
    if (s.value[k] < min) min = s.value[k];
    if (s.value[k] > max) max = s.value[k];
  }
  return min <= max ? { min, max } : null;
}

/**
 * Auto-zoom target for the expanded lane: center the window's range and fit
 * it to the lane. `minHalf` stops quiet periods (the fixed-rate era) from being
 * blown up into fake drama.
 */
export function zoomTarget(s: TrailSamples, minHalf: number, pad = 1.15): { center: number; half: number } | null {
  const r = validRange(s);
  if (!r) return null;
  return { center: (r.min + r.max) / 2, half: Math.max(minHalf, ((r.max - r.min) / 2) * pad) };
}

/**
 * Change over the visible window: from the oldest valid point to the head.
 * Values are log strengths, so the % change is exp(diff) - 1.
 */
export function windowChange(s: TrailSamples): { fromT: number; pct: number } | null {
  let k0 = -1;
  for (let k = 0; k < s.count; k++) {
    if (s.valid[k]) {
      k0 = k;
      break;
    }
  }
  const kh = s.count - 1;
  if (k0 < 0 || !s.valid[kh]) return null;
  return { fromT: s.t[k0], pct: (Math.exp(s.value[kh] - s.value[k0]) - 1) * 100 };
}

/**
 * Seek morph: when the playhead jumps, the trail (and its orb) glide from the
 * old shape to the new one instead of snapping or blanking.
 *
 * capture() stores the currently displayed curve in fixed age bins; the next
 * apply() measures the offset to the new curve, and that offset then decays
 * smoothly (time constant `tau`). Only displayed values are blended; the data
 * itself is never altered.
 */
export class TrailMorph {
  private readonly bins: number;
  private readonly oldY: Float32Array;
  private readonly oldV: Float32Array;
  private readonly off: Float32Array;
  private readonly tau: number;
  private pending = false;
  /** 1 right after a jump, decaying to 0. */
  blend = 0;

  constructor(bins = 33, tau = 0.35) {
    this.bins = bins;
    this.tau = tau;
    this.oldY = new Float32Array(bins);
    this.oldV = new Float32Array(bins);
    this.off = new Float32Array(bins);
  }

  get active(): boolean {
    return this.blend > 0;
  }

  /**
   * Remember what is on screen now. `headY` overrides the head value (e.g.
   * the dormant orb's resting height when the trail itself is empty).
   */
  capture(count: number, age: ArrayLike<number>, y: ArrayLike<number>, vis: ArrayLike<number>, headY?: number): void {
    for (let j = 0; j < this.bins; j++) {
      const a = j / (this.bins - 1);
      this.oldY[j] = interpByAge(count, age, y, a);
      this.oldV[j] = interpByAge(count, age, vis, a);
    }
    if (headY !== undefined) {
      this.oldY[0] = headY;
      this.oldV[0] = 1;
    }
    this.pending = true;
    this.blend = 1;
  }

  /**
   * Blend the new curve (y, valid -> vis) in place. Call once per frame after
   * sampling; dt advances the decay.
   */
  apply(count: number, age: ArrayLike<number>, y: Float32Array, valid: ArrayLike<number>, vis: Float32Array, dt: number): void {
    if (this.blend <= 0) {
      for (let k = 0; k < count; k++) vis[k] = valid[k];
      return;
    }
    if (this.pending) {
      // First frame after the jump: offsets that reproduce the old curve.
      for (let j = 0; j < this.bins; j++) {
        const a = j / (this.bins - 1);
        this.off[j] = this.oldV[j] > 0 ? this.oldY[j] - interpByAge(count, age, y, a) : 0;
      }
      this.pending = false;
    } else {
      this.blend *= Math.exp(-dt / this.tau);
      if (this.blend < 0.002) this.blend = 0;
    }
    const b = this.blend;
    const last = this.bins - 1;
    for (let k = 0; k < count; k++) {
      const x = age[k] * last;
      const j = Math.min(last - 1, Math.floor(x));
      const f = x - j;
      const off = this.off[j] + (this.off[j + 1] - this.off[j]) * f;
      const ov = this.oldV[j] + (this.oldV[j + 1] - this.oldV[j]) * f;
      y[k] += off * b;
      vis[k] = valid[k] * (1 - b) + ov * b;
    }
  }
}

/**
 * Linear interpolation of `v` at age `a`, over vertices ordered oldest first
 * (age decreasing). Ages outside the curve clamp to its ends.
 */
export function interpByAge(count: number, age: ArrayLike<number>, v: ArrayLike<number>, a: number): number {
  if (count <= 0) return 0;
  if (a >= age[0]) return v[0];
  if (a <= age[count - 1]) return v[count - 1];
  for (let k = 0; k < count - 1; k++) {
    const a0 = age[k];
    const a1 = age[k + 1];
    if (a <= a0 && a >= a1) {
      const span = a0 - a1;
      return span < 1e-9 ? v[k + 1] : v[k] + ((v[k + 1] - v[k]) * (a0 - a)) / span;
    }
  }
  return v[count - 1];
}
