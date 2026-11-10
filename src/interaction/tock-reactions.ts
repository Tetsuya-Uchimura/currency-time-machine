/**
 * Tock's short reactions to being touched: what to show, for how long, and
 * when to ignore a touch. Pure logic (no three.js), tested in tests/tock.test.ts;
 * GuideRobot draws the result and the experience feeds it touches.
 *
 *   head   pat    -> Petted: happy eyes, a little bounce, the antenna glows.
 *                    Patting again keeps it going (up to a few seconds).
 *   body   tap    -> Surprised (a blink of wide eyes), then Greeting: it turns
 *                    to the user, tilts its head and waves.
 *   hand   touch  -> HighFive if its hand is up (offered), else a small wave.
 *
 * After a happy reaction, when it is near and not explaining anything, Tock
 * may hold up its hand for a high five for a few seconds.
 *
 * Never in the way of the story:
 *   - while Tock speaks (or in the time tunnel) a touch gets only the small
 *     version: the eyes and the glow; no wave, no turn, no sound, no offer
 *   - pointing (a beat that needs its hand) cancels the offer and the wave
 *   - reactions never stack: a touch during another reaction is ignored
 *     (a pat during a pat extends it), and the same zone rests a moment after
 *   - a burst of touches (more than a few a second) is ignored
 */

export type Zone = 'head' | 'body' | 'hand';
export type Reaction = 'petted' | 'surprised' | 'greeting' | 'highfive';
export type Chirp = 'pat' | 'chirp' | 'highfive';

export const REACTION = {
  pettedS: 2.2,
  /** A pat during a pat adds this, up to pettedMaxS in all. */
  patExtendS: 1.2,
  pettedMaxS: 4,
  surprisedS: 0.45,
  greetingS: 2.1,
  highFiveS: 2.2,
  /** After a reaction, another touch on the same zone is ignored this long. */
  cooldownS: 0.4,
  /** A reaction may be replaced by a different one only after this much of it. */
  busyS: 1.1,
  /** How long the hand is held up for a high five, and the least time between offers. */
  offerS: 5,
  offerGapS: 9,
  /** Touch bursts: more than `burstN` touches within `burstS` are ignored until it calms down. */
  burstN: 5,
  burstS: 1.2,
  /** Sounds at most this often. */
  chirpGapS: 0.8,
};

export interface ReactionFrame {
  kind: Reaction | null;
  /** Seconds into the reaction. */
  age: number;
  /** 0..1 through it. */
  progress: number;
  /** The small version (Tock is speaking, traveling or pointing). */
  small: boolean;
  /** 0..1: how far the hand is raised for a high five. */
  offer: number;
}

export interface TouchResult {
  started: Reaction | null;
  chirp: Chirp | null;
  /** True for a successful high five (show the sparkle). */
  sparkle: boolean;
}

export class TockReactions {
  private kind: Reaction | null = null;
  private age = 0;
  private dur = 0;
  private small = false;
  private cooldown = 0;
  private lastZone: Zone | null = null;
  private offerLeft = 0;
  private offerRaise = 0;
  private sinceOffer = 99;
  private sinceChirp = 99;
  private touches: number[] = [];
  private clock = 0;

  /** A touch on a zone. `quiet`: Tock is speaking, traveling or pointing (only the small version). */
  touch(zone: Zone, quiet: boolean): TouchResult {
    const none: TouchResult = { started: null, chirp: null, sparkle: false };
    this.touches.push(this.clock);
    while (this.touches.length && this.clock - this.touches[0] > REACTION.burstS) this.touches.shift();
    if (this.touches.length > REACTION.burstN) return none;

    // A pat during a pat: keep it going.
    if (zone === 'head' && this.kind === 'petted') {
      this.dur = Math.min(REACTION.pettedMaxS, Math.max(this.dur, this.age + REACTION.patExtendS));
      return none;
    }
    if (this.kind && this.age < REACTION.busyS) return none;
    // (A hand held up for a high five is answered at once, cooldown or not.)
    const highFive = zone === 'hand' && this.offerLeft > 0 && !quiet;
    if (!this.kind && this.cooldown > 0 && zone === this.lastZone && !highFive) return none;
    this.lastZone = zone;

    let kind: Reaction;
    let sparkle = false;
    if (zone === 'head') kind = 'petted';
    else if (zone === 'body') kind = 'surprised';
    else if (this.offerLeft > 0 && !quiet) {
      kind = 'highfive';
      sparkle = true;
      this.offerLeft = 0;
    } else kind = 'greeting';
    this.start(kind, quiet);

    let chirp: Chirp | null = null;
    if (!quiet && this.sinceChirp >= REACTION.chirpGapS) {
      chirp = kind === 'petted' ? 'pat' : kind === 'highfive' ? 'highfive' : 'chirp';
      this.sinceChirp = 0;
    }
    return { started: kind, chirp, sparkle };
  }

  /** Say hello (it has just come within reach), unless a reaction is playing. */
  greet(quiet: boolean): void {
    if (this.kind) return;
    this.start('greeting', quiet);
    this.lastZone = null;
  }

  /** Hold up a hand for a high five (if it is a good moment: see update). */
  offer(): void {
    if (this.sinceOffer < REACTION.offerGapS) return;
    this.offerLeft = REACTION.offerS;
    this.sinceOffer = 0;
  }

  /** Drop everything at once (Tock leaves, the tunnel starts). */
  cancel(): void {
    this.kind = null;
    this.offerLeft = 0;
  }

  /**
   * Advance. `near`: within the user's reach; `quiet`: speaking/traveling;
   * `pointing`: a beat needs its hand.
   */
  update(dt: number, s: { near: boolean; quiet: boolean; pointing: boolean }): ReactionFrame {
    this.clock += dt;
    this.sinceOffer += dt;
    this.sinceChirp += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.kind) {
      this.age += dt;
      if (s.quiet || s.pointing) this.small = true;
      if (this.age >= this.dur) {
        const was = this.kind;
        const small = this.small;
        this.kind = null;
        this.cooldown = REACTION.cooldownS;
        if (was === 'surprised') this.start('greeting', small);
        // A happy moment, near, nothing to explain: hold up a hand.
        else if ((was === 'petted' || was === 'greeting') && !small && s.near && !s.quiet && !s.pointing) this.offer();
      }
    }
    if (s.pointing || s.quiet || !s.near) this.offerLeft = 0;
    this.offerLeft = Math.max(0, this.offerLeft - dt);
    const want = this.offerLeft > 0 ? 1 : 0;
    this.offerRaise += (want - this.offerRaise) * Math.min(1, dt / 0.3);
    return {
      kind: this.kind,
      age: this.age,
      progress: this.kind ? Math.min(1, this.age / this.dur) : 0,
      small: this.small,
      offer: this.offerRaise,
    };
  }

  get active(): Reaction | null {
    return this.kind;
  }

  get offering(): boolean {
    return this.offerLeft > 0;
  }

  private start(kind: Reaction, small: boolean): void {
    this.kind = kind;
    this.age = 0;
    this.small = small;
    this.dur = kind === 'petted' ? REACTION.pettedS : kind === 'surprised' ? REACTION.surprisedS : kind === 'greeting' ? REACTION.greetingS : REACTION.highFiveS;
  }
}
