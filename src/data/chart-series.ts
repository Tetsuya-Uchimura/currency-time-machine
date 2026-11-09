/**
 * Multi-Currency Timeline: the pure math behind the middle band's chart
 * (no three.js, no runtime imports), unit tested in tests/chart.test.ts.
 *
 * Every line is the change in a currency's value against the US dollar since
 * ONE common start: the left edge of the visible window (52 weeks ago).
 *
 *   changePct(t) = (exp(strength(t) - strength(t0)) - 1) * 100
 *
 * `strength` is the log value from src/data/timeline.ts, so the difference
 * of two strengths is the log of the value ratio; t0 is the window start.
 * A currency whose data begins inside the window cannot be measured from t0:
 * its line starts where its data starts, measured from that first week, and
 * it is flagged `late` so the chart can say so. Weeks without data are never
 * filled in (no 0% line, no invented rate).
 *
 * All lines share one y-axis. The axis range is fitted to all the lines
 * together, never per currency (see chartRange).
 */
import type { TrailSamples } from '../visual/trail-sampling.ts';

export interface ChangeBase {
  /** Week index the line is measured from (t0, or the first data week). */
  baseT: number;
  /** The line starts after the window's common start (data began later). */
  late: boolean;
  /** Change at the head (the newest point), in percent. */
  headPct: number;
  min: number;
  max: number;
}

/**
 * Convert sampled strengths (see sampleTrail) into percent change since the
 * common start. Invalid points (before the data starts) are written as 0 but
 * keep `valid = 0`, so they are never drawn. Returns null if nothing is valid.
 */
export function changeSeries(s: TrailSamples, windowStart: number, out: Float32Array): ChangeBase | null {
  let k0 = -1;
  for (let k = 0; k < s.count; k++) {
    if (s.valid[k]) {
      k0 = k;
      break;
    }
  }
  if (k0 < 0) {
    for (let k = 0; k < s.count; k++) out[k] = 0;
    return null;
  }
  const base = s.value[k0];
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < s.count; k++) {
    if (!s.valid[k]) {
      out[k] = 0;
      continue;
    }
    const pct = (Math.exp(s.value[k] - base) - 1) * 100;
    out[k] = pct;
    if (pct < min) min = pct;
    if (pct > max) max = pct;
  }
  const kh = s.count - 1;
  return { baseT: s.t[k0], late: s.t[k0] > windowStart + 1e-6, headPct: out[kh], min, max };
}

export interface ChartRange {
  lo: number;
  hi: number;
  /** Index of a line left off the scale (an extreme outlier), or -1. */
  clipped: number;
}

export const RANGE_RULES = {
  /** The axis always shows at least -min..+min percent (calm years stay calm). */
  minHalf: 2,
  /** Extra room above and below the lines (fraction of the span). */
  pad: 0.12,
  /**
   * One line may be left off the scale when its move is more than this many
   * times the next largest, so the other eight are not flattened. Lines in
   * focus (a historical event, or the soloed currency) are never left off.
   */
  outlierRatio: 3,
  /** Below this size no move counts as an outlier (percent). */
  outlierFloor: 6,
  /**
   * ...and only when the other lines move at least this much: if they are
   * flat anyway, there is nothing to rescue and the big move stays on scale.
   */
  othersFloor: 3,
};

/**
 * The shared y-range for all lines. `ext[i]` is line i's min/max (null when
 * the currency has no data in the window); `keep[i]` marks lines that must
 * stay fully on the scale.
 */
export function chartRange(ext: (ChangeBase | { min: number; max: number } | null)[], keep: boolean[], rules = RANGE_RULES): ChartRange {
  let first = -1;
  let firstSize = 0;
  let secondSize = 0;
  ext.forEach((e, i) => {
    if (!e) return;
    const size = Math.max(Math.abs(e.min), Math.abs(e.max));
    if (size > firstSize) {
      secondSize = firstSize;
      firstSize = size;
      first = i;
    } else if (size > secondSize) secondSize = size;
  });
  const clipped =
    first >= 0 &&
    !keep[first] &&
    firstSize > rules.outlierFloor &&
    secondSize >= rules.othersFloor &&
    firstSize > rules.outlierRatio * secondSize
      ? first
      : -1;
  let lo = 0;
  let hi = 0;
  ext.forEach((e, i) => {
    if (!e || i === clipped) return;
    lo = Math.min(lo, e.min);
    hi = Math.max(hi, e.max);
  });
  lo = Math.min(lo, -rules.minHalf);
  hi = Math.max(hi, rules.minHalf);
  const pad = (hi - lo) * rules.pad;
  return { lo: lo - pad, hi: hi + pad, clipped };
}

/** Gridline values for a range: a "nice" step (1, 2, 2.5, 5 x 10^k), always including 0. */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  const raw = (hi - lo) / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < 1e-9 ? 0 : +v.toFixed(6));
  return out;
}

/**
 * Spread labels vertically so none overlap (at least `gap` apart), keeping
 * their order and staying within lo..hi when there is room. Returns the new
 * positions in the input order. Labels move as little as possible.
 */
export function spreadLabels(ys: number[], gap: number, lo: number, hi: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  const pos = order.map((o) => o.y);
  const n = pos.length;
  if (n === 0) return [];
  // Clusters: merge neighbors that are too close, center each cluster on the
  // mean of its labels' targets (moves labels as little as possible).
  const start: number[] = [];
  const size: number[] = [];
  const sum: number[] = [];
  for (let k = 0; k < n; k++) {
    start.push(k);
    size.push(1);
    sum.push(pos[k]);
    while (start.length > 1) {
      const c = start.length - 1;
      const prevTop = clusterBottom(sum[c - 1], size[c - 1], gap) + (size[c - 1] - 1) * gap;
      if (clusterBottom(sum[c], size[c], gap) - prevTop >= gap - 1e-12) break;
      start.pop();
      size[c - 1] += size.pop()!;
      sum[c - 1] += sum.pop()!;
    }
  }
  const out = new Array<number>(n);
  let k = 0;
  for (let c = 0; c < start.length; c++) {
    const bottom = clusterBottom(sum[c], size[c], gap);
    for (let j = 0; j < size[c]; j++) pos[k++] = bottom + j * gap;
  }
  // Keep inside the bounds (shift the whole stack; it may not fit at all).
  for (let j = n - 1; j >= 0; j--) {
    const max = hi - (n - 1 - j) * gap;
    if (pos[j] > max) pos[j] = max;
    if (j < n - 1 && pos[j + 1] - pos[j] < gap) pos[j] = pos[j + 1] - gap;
  }
  for (let j = 0; j < n; j++) {
    const min = lo + j * gap;
    if (pos[j] < min) pos[j] = min;
    if (j > 0 && pos[j] - pos[j - 1] < gap) pos[j] = pos[j - 1] + gap;
  }
  order.forEach((o, j) => (out[o.i] = pos[j]));
  return out;
}

function clusterBottom(sum: number, size: number, gap: number): number {
  return sum / size - ((size - 1) * gap) / 2;
}

/** "JPY ▲ +8.4%": the direction is in the arrow's shape and the sign, not only in color. */
export function changeLabel(code: string, pct: number): string {
  return `${code} ${changeText(pct)}`;
}

export function changeText(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  if (r === 0) return '· 0.0%';
  const abs = Math.abs(r).toFixed(1);
  return r > 0 ? `▲ +${abs}%` : `▼ −${abs}%`;
}

/** Axis label for a gridline value: "+10%", "0%", "−2.5%". */
export function tickLabel(v: number): string {
  if (v === 0) return '0%';
  const abs = Number.isInteger(v) ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1);
  return v > 0 ? `+${abs}%` : `−${abs}%`;
}
