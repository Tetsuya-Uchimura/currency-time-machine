/**
 * Portal director: decides which historical window is open and how far its
 * animation has run. Pure logic (no three.js, no imports), unit tested.
 *
 * Two clocks are kept apart on purpose:
 *   - the window opens when the playhead is `lead` weeks before the event,
 *     together with the existing caption (the "approaching" state);
 *   - the highlight happens when the playhead reaches the event's actual
 *     date, never at the caption's early trigger.
 * Its own timers are real seconds that only advance while time flows, so a
 * paused window waits with the user. Jumps and Replay start from a clean slate.
 */

export interface DirectorScene {
  /** Week index of the event's actual date. */
  at: number;
  /** Weeks before `at` at which the window starts to open. */
  lead: number;
  /**
   * Week index of the next event's caption: the window must be gone by then,
   * so a scene of one era never sits under the caption of another.
   */
  closeBy?: number;
}

export const PORTAL_TIMING = {
  /** Opening: outline, then image, then title (seconds of flowing time). */
  appearS: 2.4,
  /** The window stays at least this long after the event date... */
  holdAfterS: 4.5,
  /** ...and at least this long in total. */
  minVisibleS: 7,
  fadeS: 2.6,
  /** Safety: close anyway once the playhead is this far past the date. */
  maxAfterWeeks: 80,
  /** Start closing this many weeks before the next caption... */
  closeMarginWeeks: 30,
  /** ...with a quicker (still smooth) fade. */
  quickFadeS: 1.2,
};

export interface PortalState {
  /** Scene index, or -1 when no window is open. */
  index: number;
  /** 0..1 opening progress (eased later by the renderer). */
  appear: number;
  /** 0..1 swell around the event date. */
  highlight: number;
  /** 0..1 closing progress. */
  out: number;
  /** True during the update in which the window started to open. */
  justOpened: boolean;
  /** True during the update in which the playhead reached the event date. */
  justReachedDate: boolean;
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export class PortalDirector {
  readonly state: PortalState = { index: -1, appear: 0, highlight: 0, out: 0, justOpened: false, justReachedDate: false };
  private readonly scenes: DirectorScene[];
  private readonly done: boolean[];
  private t = 0;
  private sinceDate = -1;
  private closing = false;
  private fadeS: number = PORTAL_TIMING.fadeS;

  constructor(scenes: DirectorScene[]) {
    this.scenes = scenes;
    this.done = scenes.map(() => false);
  }

  /**
   * The playhead jumped (chapter, Replay): no window from the old time
   * survives; windows whose date is still ahead may open again.
   */
  seek(p: number): void {
    this.scenes.forEach((s, i) => (this.done[i] = s.at < p - 0.5));
    this.state.index = -1;
    this.state.appear = this.state.highlight = this.state.out = 0;
    this.closing = false;
  }

  /** The next scene worth preparing (assets) at playhead p, or -1. */
  upcoming(p: number, aheadWeeks: number): number {
    if (this.state.index >= 0) return this.state.index;
    for (let i = 0; i < this.scenes.length; i++) {
      const s = this.scenes[i];
      if (!this.done[i] && p >= s.at - s.lead - aheadWeeks && p < s.at + PORTAL_TIMING.maxAfterWeeks) return i;
    }
    return -1;
  }

  /** Advance. `flowing` is false while paused (timers wait). */
  update(p: number, dt: number, flowing: boolean): PortalState {
    const st = this.state;
    st.justOpened = st.justReachedDate = false;
    if (!flowing) return st;
    const T = PORTAL_TIMING;

    if (st.index < 0) {
      for (let i = 0; i < this.scenes.length; i++) {
        const s = this.scenes[i];
        const tooLate = p >= (s.closeBy ?? Infinity) - T.closeMarginWeeks;
        if (!this.done[i] && p >= s.at - s.lead && p < s.at + T.maxAfterWeeks && !tooLate) {
          st.index = i;
          st.justOpened = true;
          this.t = 0;
          this.sinceDate = -1;
          this.closing = false;
          st.out = 0;
          break;
        }
      }
      if (st.index < 0) return st;
    } else {
      this.t += dt;
    }

    const s = this.scenes[st.index];
    if (this.sinceDate < 0 && p >= s.at) {
      this.sinceDate = 0;
      st.justReachedDate = true;
    } else if (this.sinceDate >= 0) {
      this.sinceDate += dt;
    }

    const next = s.closeBy ?? Infinity;
    if (!this.closing) {
      const held = this.sinceDate >= T.holdAfterS && this.t >= T.minVisibleS;
      if (held || p > s.at + T.maxAfterWeeks) {
        this.closing = true;
        this.fadeS = T.fadeS;
      }
    }
    if (p >= next - T.closeMarginWeeks && this.fadeS !== T.quickFadeS) {
      // The next moment is coming: leave quickly so captions never mix eras.
      this.closing = true;
      this.fadeS = T.quickFadeS;
    }
    if (this.closing) st.out = Math.min(1, st.out + dt / this.fadeS);

    st.appear = Math.min(1, this.t / T.appearS);
    // Highlight: swells over ~0.8 s at the date, then settles over a few seconds.
    if (this.sinceDate < 0) st.highlight = 0;
    else {
      const h = this.sinceDate;
      st.highlight = smooth(h / 0.8) * (h < 0.8 ? 1 : Math.exp(-(h - 0.8) / 2.5));
    }

    if (st.out >= 1) {
      this.done[st.index] = true;
      st.index = -1;
      st.appear = st.highlight = st.out = 0;
      this.closing = false;
    }
    return st;
  }
}
