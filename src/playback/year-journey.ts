/**
 * Year Journey runner: walks through a year's beats (src/guide/guide-scripts.ts)
 * on the one playback clock. Pure (no imports), unit tested in tests/guide.test.ts.
 *
 * The clock plays the year's weeks; each beat has a week (`at`) where the
 * clock stops (PlaybackClock.stopAt) while the guide speaks it. A beat ends
 * after its minimum time once speech has finished, or at its maximum time
 * (so a silent or stuck speech engine never blocks the journey). Then the
 * clock flows on to the next beat. The year never plays past its last week.
 */

export interface RunnerBeat {
  at: number;
  text: string;
}

export interface BeatTimes {
  /** Seconds a beat stays at least (subtitles must be readable). */
  minS: number;
  /** Seconds after which it ends even if speech is still running. */
  maxS: number;
}

export class YearRunner<B extends RunnerBeat = RunnerBeat> {
  readonly beats: B[];
  readonly last: number;
  /** The beat being said (the clock stands still), or null. */
  current: B | null = null;
  private next = 0;
  private age = 0;
  private times: BeatTimes = { minS: 0, maxS: 0 };
  private skipped = false;

  constructor(beats: B[], last: number) {
    this.beats = beats;
    this.last = last;
  }

  /** Where the clock must stop next: the next beat's week, or the year's last week. */
  get stopAt(): number {
    return this.next < this.beats.length ? Math.min(this.beats[this.next].at, this.last) : this.last;
  }

  get holding(): boolean {
    return this.current !== null;
  }

  /** Every beat has been said and the year has reached its last week. */
  doneAt(position: number): boolean {
    return !this.current && this.next >= this.beats.length && position >= this.last - 1e-6;
  }

  /** Seconds the current beat has been showing. */
  get currentAge(): number {
    return this.age;
  }

  /** Index of the current (or next) beat, for progress displays. */
  get index(): number {
    return this.current ? this.next - 1 : this.next;
  }

  /**
   * Advance by dt seconds at clock position `position`.
   * `speaking`: the narration is still talking. `paused`: nothing ages.
   * `timesOf` gives a beat's min/max seconds when it starts.
   * Returns the beat that started during this call, or null.
   */
  update(dt: number, position: number, speaking: boolean, paused: boolean, timesOf: (b: B) => BeatTimes): B | null {
    if (paused) return null;
    if (this.current) {
      this.age += dt;
      const t = this.times;
      const done = this.skipped || (this.age >= t.minS && !speaking) || this.age >= t.maxS;
      if (!done) return null;
      this.current = null;
      this.skipped = false;
    }
    if (this.next < this.beats.length && position >= Math.min(this.beats[this.next].at, this.last) - 1e-6) {
      const b = this.beats[this.next++];
      this.current = b;
      this.age = 0;
      this.times = timesOf(b);
      return b;
    }
    return null;
  }

  /** End the current line now (Skip). */
  skip(): void {
    if (this.current) this.skipped = true;
  }
}

/**
 * The year the time tunnel's counter shows at warp progress p (0..1): it
 * holds the starting year briefly, runs with an ease to the target, and holds
 * the target for the arrival.
 */
export function warpYearAt(from: number, to: number, p: number): number {
  const e = p < 0.15 ? 0 : p > 0.78 ? 1 : (1 - Math.cos(((p - 0.15) / 0.63) * Math.PI)) / 2;
  return Math.round(from + (to - from) * e);
}
