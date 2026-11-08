/**
 * Timeline: loads the bundled weekly history and precomputes, per week,
 * everything the visuals and the sound read every frame.
 *
 * Terms used throughout the app:
 *   rate      units of a currency per 1 unit of the base currency (USD).
 *   value     log of how many base units one unit of the currency buys.
 *   strength  value now minus value when the currency first appeared
 *             (> 0: it gained against the base since its "birth").
 *   momentum  value change over the last ~half year (short-term direction).
 *   vol       smoothed size of week-to-week moves ("speed of change").
 *   turbulence  average vol across all live currencies, normalized 0..1.
 */

export interface HistorySegment {
  code: string;
  fromIndex: number;
}

export interface HistoryCurrency {
  slot: string;
  first: number;
  segments: HistorySegment[];
  chainFactor: number;
  values: number[];
}

export interface HistoryFile {
  attribution: string;
  base: string;
  start: string;
  end: string;
  stepDays: number;
  count: number;
  currencies: HistoryCurrency[];
}

export interface SlotSeries {
  slot: string;
  /** First week index with data (the orb is dormant before it). */
  first: number;
  segments: HistorySegment[];
  /** Units of the slot's (chained) currency per base unit at its first week. */
  firstRate: number;
  chainFactor: number;
  strength: Float32Array;
  momentum: Float32Array;
  vol: Float32Array;
}

const MOMENTUM_WEEKS = 26;
/** EMA weight for per-currency volatility (about a 2-month memory). */
const VOL_ALPHA = 0.12;
/** Turbulence normalization: a typical crisis week sits near 1.0. */
const TURBULENCE_REF = 0.014;

export class Timeline {
  readonly count: number;
  readonly startMs: number;
  readonly stepDays: number;
  readonly attribution: string;
  readonly slots: SlotSeries[];
  /** Normalized market-wide turbulence 0..1 per week. */
  readonly turbulence: Float32Array;

  constructor(file: HistoryFile, slotOrder: string[]) {
    this.count = file.count;
    this.stepDays = file.stepDays;
    this.startMs = Date.parse(file.start + 'T00:00:00Z');
    this.attribution = file.attribution;

    const bySlot = new Map(file.currencies.map((c) => [c.slot, c]));
    this.slots = slotOrder.map((slot) => {
      const c = bySlot.get(slot);
      if (!c) throw new Error(`history.json has no slot ${slot}`);
      return buildSeries(c, this.count);
    });

    // Market-wide turbulence: mean vol of the currencies alive that week.
    this.turbulence = new Float32Array(this.count);
    for (let t = 0; t < this.count; t++) {
      let sum = 0;
      let n = 0;
      for (const s of this.slots) {
        if (t > s.first) {
          sum += s.vol[t];
          n++;
        }
      }
      this.turbulence[t] = n ? Math.min(1, sum / n / TURBULENCE_REF) : 0;
    }
  }

  /** Week index (fractional) for a calendar date. */
  indexOf(isoDate: string): number {
    const ms = Date.parse(isoDate + 'T00:00:00Z');
    return (ms - this.startMs) / (this.stepDays * 86400000);
  }

  /** Calendar date for a (fractional) week index. */
  dateAt(index: number): Date {
    return new Date(this.startMs + index * this.stepDays * 86400000);
  }

  /** Linear interpolation into a per-week array at fractional index p. */
  static sample(arr: Float32Array, p: number): number {
    const n = arr.length;
    if (p <= 0) return arr[0];
    if (p >= n - 1) return arr[n - 1];
    const i = Math.floor(p);
    const f = p - i;
    return arr[i] + (arr[i + 1] - arr[i]) * f;
  }

  /** Display currency code of a slot at week index p (DEM before 1999 etc.). */
  codeAt(slotIndex: number, p: number): string {
    const segs = this.slots[slotIndex].segments;
    let code = segs[0].code;
    for (const s of segs) if (p >= s.fromIndex) code = s.code;
    return code;
  }
}

function buildSeries(c: HistoryCurrency, count: number): SlotSeries {
  const strength = new Float32Array(count);
  const momentum = new Float32Array(count);
  const vol = new Float32Array(count);
  const logValue = new Float64Array(count);

  for (let t = 0; t < count; t++) {
    const k = t - c.first;
    // value = log(base units per currency unit) = -log(rate)
    logValue[t] = k >= 0 ? -Math.log(c.values[k]) : NaN;
  }
  const v0 = logValue[c.first];
  let ema = 0;
  for (let t = 0; t < count; t++) {
    if (t < c.first) continue;
    strength[t] = logValue[t] - v0;
    const back = Math.max(c.first, t - MOMENTUM_WEEKS);
    momentum[t] = logValue[t] - logValue[back];
    if (t > c.first) {
      ema += VOL_ALPHA * (Math.abs(logValue[t] - logValue[t - 1]) - ema);
    }
    vol[t] = ema;
  }
  return {
    slot: c.slot,
    first: c.first,
    segments: c.segments,
    firstRate: c.values[0],
    chainFactor: c.chainFactor,
    strength,
    momentum,
    vol,
  };
}

/** Fetch and parse the bundled history file. */
export async function loadTimeline(slotOrder: string[]): Promise<Timeline> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/history.json`);
  if (!res.ok) throw new Error(`history.json: HTTP ${res.status}`);
  return new Timeline((await res.json()) as HistoryFile, slotOrder);
}
