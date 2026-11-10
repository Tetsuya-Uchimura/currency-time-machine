/**
 * Tock as a companion: comes within reach when pinched, reacts to touches,
 * and goes back to its place when left alone.
 *
 *   - Pinch Tock from afar (any part): it floats to a spot within reach
 *     (config TOCK_REACH; the side away from the hand panel), waves hello.
 *   - Near: touch its head (pat), its body (tap) or its hand (high five when
 *     the hand is up). Touches come from IWSDK's ray (pinch) or poke (finger),
 *     or a mouse click on a PC.
 *   - After TOCK_REACH.idleS without a touch, or when the time tunnel starts,
 *     it floats back to its guide spot.
 *
 * It never interrupts the story: no speech is started or stopped here (the
 * voice is never cancelled for a touch), the year and the beats go on, and
 * while Tock speaks a touch gets only the small reaction, without a sound.
 * Hints: "Touch Tock!" the first time it comes near (until the first touch on
 * this browser), "High five!" while its hand is up.
 */
import { TOCK_REACH } from '../config.ts';
import type { GuideRobot } from '../visual/guide-robot.ts';
import { TockReactions, type Chirp, type Zone } from './tock-reactions.ts';

const TOUCHED_KEY = 'ctm-tock-touched';

/** Tock's reach spot for a hand panel at this yaw (degrees): the usual one unless the panel is beside it. */
export function reachSpotFor(panelYaw: number): readonly [number, number, number] {
  const yawOf = (p: readonly number[]) => (Math.atan2(p[0], -p[2]) * 180) / Math.PI;
  return Math.abs(yawOf(TOCK_REACH.spot) - panelYaw) >= TOCK_REACH.clearDeg ? TOCK_REACH.spot : TOCK_REACH.alt;
}

export interface CompanionState {
  /** Tock is speaking (or the line is shown without a voice). */
  quiet: boolean;
  /** The time tunnel is running. */
  warp: boolean;
  /** Tock is shown at all. */
  shown: boolean;
  /** The hand panel's yaw (degrees): Tock's reach spot avoids it. */
  panelYaw: number;
}

export class TockCompanion {
  readonly reactions = new TockReactions();
  private idle = 0;
  private greetPending = false;
  private hintLeft = 0;
  private touched: boolean;
  private hintText: (key: 'tock.touch' | 'tock.highFive') => string;
  private readonly robot: GuideRobot;
  private readonly chirp: (kind: Chirp) => void;

  constructor(robot: GuideRobot, chirp: (kind: Chirp) => void, hintText: (key: 'tock.touch' | 'tock.highFive') => string) {
    this.robot = robot;
    this.chirp = chirp;
    this.hintText = hintText;
    let t = false;
    try {
      t = localStorage.getItem(TOUCHED_KEY) === '1';
    } catch {
      /* private mode */
    }
    this.touched = t;
  }

  /** A touch zone was pinched, poked or clicked. */
  touch(zone: Zone, s: CompanionState): void {
    if (!s.shown) return;
    const quiet = s.quiet || s.warp;
    if (!this.robot.atReach) {
      if (s.warp) {
        this.reactions.touch(zone, true); // (in the tunnel: only a smile)
        return;
      }
      this.summon(s.panelYaw);
      return;
    }
    const res = this.reactions.touch(zone, quiet);
    if (res.started) {
      this.idle = 0;
      if (!this.touched) {
        this.touched = true;
        this.hintLeft = 0;
        try {
          localStorage.setItem(TOUCHED_KEY, '1');
        } catch {
          /* private mode */
        }
      }
    }
    if (res.chirp && !quiet) this.chirp(res.chirp);
    if (res.sparkle) this.robot.sparkle();
  }

  /** Come within reach: the usual spot, or the other one if the hand panel was moved next to it. */
  summon(panelYaw: number): void {
    const spot = reachSpotFor(panelYaw);
    this.robot.setReach(spot);
    this.idle = 0;
    this.greetPending = true;
  }

  /** Back to the guide spot. */
  dismiss(): void {
    if (!this.robot.atReach) return;
    this.robot.setReach(null);
    this.reactions.cancel();
    this.greetPending = false;
    this.hintLeft = 0;
  }

  /** A one-time invitation (first visit): "Touch Tock!" above it for a few seconds. */
  invite(): void {
    if (!this.touched) this.hintLeft = Math.max(this.hintLeft, 6);
  }

  get near(): boolean {
    return this.robot.atReach;
  }

  update(dt: number, s: CompanionState): void {
    if ((s.warp || !s.shown) && this.robot.atReach) this.dismiss();
    const quiet = s.quiet || s.warp;
    const arrived = this.robot.arrived;
    if (this.greetPending && arrived) {
      this.greetPending = false;
      this.reactions.greet(quiet);
      if (!quiet) this.chirp('chirp');
      this.invite();
    }
    if (this.robot.atReach && !this.reactions.active && !this.reactions.offering) {
      this.idle += dt;
      if (this.idle > TOCK_REACH.idleS) this.dismiss();
    } else this.idle = 0;
    const frame = this.reactions.update(dt, { near: arrived, quiet, pointing: this.robot.pointing });
    this.robot.setReaction(frame);
    this.hintLeft = Math.max(0, this.hintLeft - dt);
    // (A silent label: shown while Tock speaks too, never in the tunnel.)
    this.robot.showHint(this.reactions.offering && !quiet ? this.hintText('tock.highFive') : this.hintLeft > 0 && !s.warp ? this.hintText('tock.touch') : '');
  }

  /** The display language changed: the hint is drawn again on its next showing. */
  relabel(hintText: (key: 'tock.touch' | 'tock.highFive') => string): void {
    this.hintText = hintText;
  }
}
