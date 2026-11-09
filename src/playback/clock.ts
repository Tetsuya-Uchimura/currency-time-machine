/**
 * Playback clock: maps real seconds to a (fractional) week index.
 *
 * Pure logic with no IWSDK/three dependency, so its pacing can be simulated
 * (see scripts/simulate-pacing.ts). Speeds are in weeks per real second.
 *
 *   fixed era (1948-1971)   fast and calm: ~23 years in ~35 s
 *   floating era (1971-)    ~20 weeks/s, i.e. one year every ~2.6 s
 *   major events            a smooth dip in speed centered on the date
 *   opening                 starts slowly so the first caption can be read
 */

export interface SlowDown {
  /** Week index of the moment. */
  center: number;
  /** Gaussian half-width in weeks. */
  width: number;
  /** 0..1, how much the speed drops at the center. */
  depth: number;
}

export interface PacingConfig {
  fixedSpeed: number;
  floatSpeed: number;
  /** Week index where the floating era begins. */
  floatStart: number;
  /** Weeks over which the fixed->floating speed change is blended. */
  blendWeeks: number;
  /** Weeks over which the opening ramps up from introFactor to full speed. */
  introWeeks: number;
  introFactor: number;
  slowDowns: SlowDown[];
}

export const DEFAULT_PACING: Omit<PacingConfig, 'floatStart' | 'slowDowns'> = {
  fixedSpeed: 36,
  floatSpeed: 20,
  blendWeeks: 40,
  introWeeks: 160,
  introFactor: 0.3,
};

export const MAJOR_SLOWDOWN = { width: 16, depth: 0.85 };

/** Slow-downs for every major event plus any minor event with a custom one. */
export function slowDownsFor(
  events: { date: string; tier: string; slow?: { width: number; depth: number } }[],
  indexOf: (date: string) => number,
): SlowDown[] {
  return events
    .filter((e) => e.tier === 'major' || e.slow)
    .map((e) => ({ center: indexOf(e.date), ...(e.slow ?? MAJOR_SLOWDOWN) }));
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class PlaybackClock {
  /** Current week index (fractional). */
  position = 0;
  paused = false;
  /** True once the clock has reached the last week ("today"). */
  ended = false;
  /** Extra speed factor (1 = normal); eased down while a history card is open. */
  rate = 1;
  /**
   * The clock never passes this week (Year Journey: the guide's next beat).
   * It slows smoothly into it, then waits until it is moved on.
   */
  stopAt = Infinity;
  /** Year Journey: play only [start, end] at a constant pace (weeks per second). */
  private window: { start: number; end: number; speed: number } | null = null;

  private readonly lastIndex: number;
  private readonly pacing: PacingConfig;

  // (No TS parameter properties: this file must also run under Node's
  // type-stripping for scripts/simulate-pacing.ts.)
  constructor(lastIndex: number, pacing: PacingConfig) {
    this.lastIndex = lastIndex;
    this.pacing = pacing;
  }

  speedAt(p: number): number {
    if (this.window) {
      // Constant pace, easing into the next stop (never below 12%, so it arrives).
      const gap = Math.min(this.stopAt, this.window.end) - p;
      return this.window.speed * Math.min(1, Math.max(0.12, gap / 1.2));
    }
    const c = this.pacing;
    const blend = smoothstep(c.floatStart - c.blendWeeks, c.floatStart + c.blendWeeks, p);
    let speed = c.fixedSpeed + (c.floatSpeed - c.fixedSpeed) * blend;
    speed *= c.introFactor + (1 - c.introFactor) * smoothstep(0, c.introWeeks, p);
    for (const s of c.slowDowns) {
      const z = (p - s.center) / s.width;
      if (z > -4 && z < 4) speed *= 1 - s.depth * Math.exp(-z * z);
    }
    return speed;
  }

  /** Advance by dt real seconds. Returns the previous position. */
  advance(dt: number): number {
    const prev = this.position;
    if (this.paused || this.ended) return prev;
    // Midpoint integration keeps pacing stable at any frame rate.
    const t = dt * this.rate;
    const mid = this.position + 0.5 * t * this.speedAt(this.position);
    this.position += t * this.speedAt(mid);
    const end = this.endIndex;
    if (this.position >= this.stopAt && this.stopAt < end) this.position = Math.max(prev, this.stopAt);
    if (this.position >= end) {
      this.position = end;
      this.ended = true;
    }
    return prev;
  }

  /** The last week this clock may reach (a Year Journey's window, or the data's end). */
  get endIndex(): number {
    return this.window ? Math.min(this.window.end, this.lastIndex) : this.lastIndex;
  }

  get windowed(): boolean {
    return this.window !== null;
  }

  seek(p: number): void {
    const lo = this.window ? this.window.start : 0;
    this.position = Math.max(lo, Math.min(this.endIndex, p));
    this.ended = this.position >= this.endIndex;
  }

  /** Year Journey: play only [start, end] (week indices) at `speed` weeks per second. */
  setWindow(start: number, end: number, speed: number): void {
    this.window = { start, end, speed };
    this.stopAt = Infinity;
    this.rate = 1;
    this.seek(start);
  }

  /** Back to the full 1948-today journey. */
  clearWindow(): void {
    this.window = null;
    this.stopAt = Infinity;
    this.ended = this.position >= this.lastIndex;
  }

  /** Real seconds it takes to play from week a to week b (for tuning/tests). */
  durationBetween(a: number, b: number, step = 0.02): number {
    let p = a;
    let t = 0;
    while (p < b) {
      p += step * this.speedAt(p);
      t += step;
    }
    return t;
  }
}
