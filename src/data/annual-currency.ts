/**
 * Year Journey: one calendar year of the weekly history, and each currency's
 * change over it. Pure (no runtime imports), unit tested in tests/annual.test.ts.
 *
 * The history is weekly (one observation every Friday, see timeline.ts), so a
 * year is measured between real observations, never interpolated ones:
 *
 *   start  the first weekly observation on or after 1 January
 *   end    the last weekly observation on or before 31 December
 *
 * The app always names those two dates ("Jan 4 to Dec 27"). Two cases cut a
 * year short, and are said so:
 *   - the data begins inside the year (1948 starts in June; JPY joins in
 *     1969, CNY/KRW in 1981): that currency is measured from its first week
 *     and is NOT ranked with the others (a different period);
 *   - the year is not over in the data (the latest year): "year to date".
 *
 * Change is the change in the currency's VALUE against the US dollar:
 *   pct = (rate at start / rate at end - 1) * 100      (rate = units per USD)
 * so a stronger yen (fewer yen per dollar) is a positive number. This is the
 * same quantity the chart draws: exp(strength(end) - strength(start)) - 1.
 */

export interface TimelineLike {
  count: number;
  indexOf(isoDate: string): number;
  dateAt(index: number): Date;
}

export interface SlotLike {
  slot: string;
  first: number;
  firstRate: number;
  chainFactor: number;
  strength: ArrayLike<number>;
  segments: { code: string; fromIndex: number }[];
}

export interface YearWindow {
  year: number;
  /** Week index (fractional) of 1 January and of the next 1 January: the chart's x axis. */
  axisStart: number;
  axisEnd: number;
  /** First and last weekly observation inside the year (integer week indices). */
  first: number;
  last: number;
  /** The data begins after the year's first week (1948). */
  startsLate: boolean;
  /** The year is not over in the data (the latest year: year to date). */
  ongoing: boolean;
}

/** Years that can be visited: the first and last with at least one observation. */
export function yearSpan(tl: TimelineLike): { min: number; max: number } {
  return { min: tl.dateAt(0).getUTCFullYear(), max: tl.dateAt(tl.count - 1).getUTCFullYear() };
}

export function yearWindow(tl: TimelineLike, year: number): YearWindow | null {
  const axisStart = tl.indexOf(`${pad4(year)}-01-01`);
  const axisEnd = tl.indexOf(`${pad4(year + 1)}-01-01`);
  const firstInYear = Math.ceil(axisStart - 1e-9);
  const lastInYear = Math.ceil(axisEnd - 1e-9) - 1;
  const first = Math.max(0, firstInYear);
  const last = Math.min(tl.count - 1, lastInYear);
  if (last < first) return null;
  return { year, axisStart, axisEnd, first, last, startsLate: first > firstInYear, ongoing: lastInYear > tl.count - 1 };
}

/** Display code of a slot at week k (DEM before 1999, then EUR). */
export function codeAt(s: SlotLike, k: number): string {
  let code = s.segments[0].code;
  for (const seg of s.segments) if (k >= seg.fromIndex) code = seg.code;
  return code;
}

/**
 * Units of the currency of the time per US dollar at week k. The EUR slot's
 * history is chained in Deutsche Mark units; euro-era weeks are converted back.
 */
export function rateAt(s: SlotLike, k: number): number {
  const r = s.firstRate / Math.exp(s.strength[k]);
  return s.segments.length > 1 && k >= s.segments[s.segments.length - 1].fromIndex ? r / s.chainFactor : r;
}

export interface AnnualChange {
  slot: string;
  /** Index in the slot list. */
  index: number;
  /** Week indices and dates of the two observations compared. */
  from: number;
  to: number;
  fromDate: string;
  toDate: string;
  codeFrom: string;
  codeTo: string;
  /** Units per USD at the two observations, in the currency of the time. */
  rateFrom: number;
  rateTo: number;
  /** Change in value vs USD, percent (positive: stronger than the dollar). */
  pct: number;
  /** Measured over the year's common window (rankable with the others). */
  comparable: boolean;
  /** The currency's data begins inside this year. */
  late: boolean;
}

export function annualChange(tl: TimelineLike, s: SlotLike, index: number, w: YearWindow): AnnualChange | null {
  if (s.first > w.last) return null; // no data yet this year
  const from = Math.max(w.first, s.first);
  const to = w.last;
  const late = s.first > w.first;
  const iso = (k: number) => tl.dateAt(k).toISOString().slice(0, 10);
  return {
    slot: s.slot,
    index,
    from,
    to,
    fromDate: iso(from),
    toDate: iso(to),
    codeFrom: codeAt(s, from),
    codeTo: codeAt(s, to),
    rateFrom: rateAt(s, from),
    rateTo: rateAt(s, to),
    pct: (Math.exp(s.strength[to] - s.strength[from]) - 1) * 100,
    comparable: !late && to > from,
    late,
  };
}

export function annualChanges(tl: TimelineLike, slots: SlotLike[], year: number): (AnnualChange | null)[] {
  const w = yearWindow(tl, year);
  return slots.map((s, i) => (w ? annualChange(tl, s, i, w) : null));
}

/**
 * Ranking for the summary: only currencies measured over the same period
 * (strongest gain first). Late starters are listed separately by the caller.
 */
export function ranking(changes: (AnnualChange | null)[]): AnnualChange[] {
  return changes.filter((c): c is AnnualChange => !!c && c.comparable).sort((a, b) => b.pct - a.pct);
}

/**
 * The sharpest stretch of a year for one currency: the largest change in
 * value over `span` weeks between two observations inside [from, to].
 */
export function sharpestMove(
  s: SlotLike,
  from: number,
  to: number,
  span = 8,
): { start: number; end: number; pct: number } | null {
  let best: { start: number; end: number; pct: number } | null = null;
  for (let a = Math.max(from, s.first); a + span <= to; a++) {
    const pct = (Math.exp(s.strength[a + span] - s.strength[a]) - 1) * 100;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { start: a, end: a + span, pct };
  }
  return best;
}

/** "+12.3%" / "−4.0%" (the minus is a true minus sign). */
export function signedPct(pct: number, digits = 1): string {
  const v = Math.abs(pct).toFixed(digits);
  return pct >= 0 ? `+${v}%` : `−${v}%`;
}

/** Rates per USD with sensible precision: 1,743 / 241.6 -> 242 / 2.89 / 0.677. */
export function formatRate(r: number): string {
  if (r >= 100) return Math.round(r).toLocaleString('en-US');
  if (r >= 10) return r.toFixed(1);
  if (r >= 1) return r.toFixed(2);
  return r.toFixed(3);
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jan 4" from an ISO date. */
export function shortDate(iso: string): string {
  return `${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

/** What the comparison covers, said plainly: "Jan 4 to Dec 27, 1985 (weekly observations)". */
export function periodText(w: YearWindow, c?: AnnualChange | null): string {
  const from = c ? c.fromDate : '';
  const to = c ? c.toDate : '';
  if (!c) return `${w.year}`;
  const tail = w.ongoing ? ' (year to date)' : '';
  return `${shortDate(from)} to ${shortDate(to)}, ${w.year}${tail}`;
}

function pad4(y: number): string {
  return String(y).padStart(4, '0');
}
