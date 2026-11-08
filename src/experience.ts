/**
 * ExperienceSystem: the conductor. Each frame it advances the time-lapse,
 * fires historical moments, and feeds the same per-currency numbers to the
 * orbs (light) and the sound engine (sound), so both stay in sync.
 *
 * States:
 *   idle     waiting for XR entry (or the "watch in browser" click)
 *   playing  the time-lapse runs (can be paused)
 *   today    the clock caught up with the present; live rates are shown
 */
import {
  AudioListener,
  createSystem,
  Group,
  PokeInteractable,
  Pressed,
  RayInteractable,
  Vector3,
  VisibilityState,
  type Entity,
  type UIKitMLAsset,
} from '@iwsdk/core';
import { Narration } from './a11y/narration.js';
import { SoundEngine, type VoiceInput } from './audio/engine.js';
import { strengthToSteps } from './audio/scale.js';
import { Orb } from './components.js';
import { BASE_CURRENCY, LAYOUT, SLOTS } from './config.js';
import { CHAPTERS, EVENTS, FLOAT_START, HINT_TEXT, type HistoryEvent } from './data/events.js';
import { Timeline } from './data/timeline.js';
import { loadToday, type TodayData } from './data/today.js';
import { DEFAULT_PACING, PlaybackClock, slowDownsFor } from './playback/clock.js';
import { Ambience } from './visual/ambience.js';
import { createGuides, InfoCard, OrbView, type OrbState } from './visual/orbs.js';

type Phase = 'idle' | 'playing' | 'today';

interface Caption {
  label: string;
  text: string;
  minS: number;
  maxS: number;
  hint?: boolean;
}

interface Moment {
  event: HistoryEvent;
  /** Week index at which the caption appears. */
  trigger: number;
  fired: boolean;
}

/** Shortest a caption stays when another is waiting, and its natural length. */
const CAPTION_TIMES = { major: [4.5, 7.5], minor: [3.5, 6], hint: [5, 7] } as const;
const FOCUS_HOLD_S = 5;

export class ExperienceSystem extends createSystem({
  pressedOrbs: { required: [Orb, Pressed] },
}) {
  private ready = false;
  private phase: Phase = 'idle';
  private timeline!: Timeline;
  private clock!: PlaybackClock;
  private audio!: SoundEngine;
  private narration = new Narration();
  private today: TodayData | null = null;
  private todayPromise: Promise<TodayData | null> | null = null;

  private rig!: Entity;
  private orbs: OrbView[] = [];
  private infoCard = new InfoCard();
  private ambience!: Ambience;
  private captionPanel!: UIKitMLAsset;
  private handPanel!: UIKitMLAsset;

  private moments: Moment[] = [];
  private hintShown = false;
  private hintIndex = 0;
  private floatStartIndex = 0;
  private captionQueue: Caption[] = [];
  private caption: Caption | null = null;
  private captionAge = 0;
  private lastYear = -1;
  private lastDecade = -1;
  private focus: number[] = [];
  private solo = -1;
  private autoPaused = false;
  private needsAnchor = true;
  private anchorDelay = 0;
  private audioPosTimer = 0;
  private infoTimer = 0;

  // Reused per-frame objects (no allocations in update()).
  private readonly voiceInputs: VoiceInput[] = SLOTS.map(() => ({ alive: false, degree: 0, vol: 0 }));
  private readonly orbStates: OrbState[] = SLOTS.map(() => ({ alive: false, height: 0, brightness: 0, focus: 0, code: '' }));
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.pressedOrbs.subscribe('qualify', (entity) => {
        this.toggleSolo(entity.getValue(Orb, 'slotIndex') ?? -1);
      }),
      this.world.visibilityState.subscribe((state) => this.onVisibility(state)),
    );
    const onHidden = () => {
      if (document.hidden) this.autoPause();
      else this.autoResume();
    };
    document.addEventListener('visibilitychange', onHidden);
    this.cleanupFuncs.push(() => document.removeEventListener('visibilitychange', onHidden));
  }

  /** Builds the world once data and panels are available. Called from index.ts. */
  async setup(timeline: Timeline): Promise<void> {
    this.timeline = timeline;
    this.floatStartIndex = timeline.indexOf(FLOAT_START);
    this.clock = new PlaybackClock(timeline.count - 1, {
      ...DEFAULT_PACING,
      floatStart: this.floatStartIndex,
      slowDowns: slowDownsFor(EVENTS, (d) => timeline.indexOf(d)),
    });
    this.moments = EVENTS.map((event) => {
      const at = timeline.indexOf(event.date);
      // Majors: caption appears as the slow-down begins. Minors: just before.
      const lead = event.tier === 'major' ? 16 : 3;
      return { event, trigger: Math.max(0, at - lead), fired: false };
    });
    this.hintIndex = timeline.indexOf('1951-06-01');
    this.focus = SLOTS.map(() => 0);

    this.audio = new SoundEngine(SLOTS.map((s) => s.timbre));
    this.audio.onNote((i, velocity) => this.orbs[i]?.pulse(velocity));
    // Start fetching today's rates right away; the ending needs them later.
    // (Slot ids are also today's codes: the EUR slot ends as the euro.)
    this.todayPromise = loadToday(SLOTS.map((s) => s.slot));

    // Rig: everything is placed relative to the user's head at start.
    this.rig = this.world.createTransformEntity(new Group());
    this.ambience = new Ambience();
    this.world.createTransformEntity(this.ambience.sky, { parent: this.rig });
    this.world.createTransformEntity(this.ambience.motes, { parent: this.rig });

    const half = (LAYOUT.arcDeg * Math.PI) / 360;
    const angles = SLOTS.map((_, i) => -half + (2 * half * i) / (SLOTS.length - 1));
    this.world.createTransformEntity(createGuides(angles), { parent: this.rig });
    SLOTS.forEach((meta, i) => {
      const view = new OrbView(meta, angles[i]);
      const entity = this.world.createTransformEntity(view.group, { parent: this.rig });
      // Hands: pinch from afar (ray) or touch directly (poke).
      entity.addComponent(Orb, { slotIndex: i });
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      this.orbs.push(view);
    });
    this.world.createTransformEntity(this.infoCard.mesh, { parent: this.rig });

    // Caption board: ahead and above the orbs, large type.
    this.captionPanel = await this.world.assets.instantiate<UIKitMLAsset>('caption-panel');
    this.captionPanel.position.set(0, 0.3, -1.1);
    this.captionPanel.scale.setScalar(0.1);
    this.world.createTransformEntity(this.captionPanel, { parent: this.rig });

    // Hand panel: low, close, tilted up toward the user (seated reach).
    this.handPanel = await this.world.assets.instantiate<UIKitMLAsset>('hand-panel');
    // Low and close like a lap tray, below the path a hand takes toward the orbs.
    this.handPanel.position.set(0, -0.4, -0.33);
    this.handPanel.rotation.x = -0.85;
    this.handPanel.scale.setScalar(0.1);
    const panelEntity = this.world.createTransformEntity(this.handPanel, { parent: this.rig });
    panelEntity.addComponent(RayInteractable);
    panelEntity.addComponent(PokeInteractable);
    this.wirePanel();

    this.ensureListener();
    this.applyPosition(0, 0);
    this.ready = true;
  }

  // -------------------------------------------------------------------------
  // Lifecycle & input
  // -------------------------------------------------------------------------

  /** Start the time-lapse from 1948 (from XR entry, a click, or Replay). */
  start(): void {
    if (!this.ready) return;
    void this.audio.unlock().then(() => this.audio.setPaused(false));
    this.clock.paused = false;
    this.clock.seek(0);
    this.resetMoments(0);
    this.phase = 'playing';
    this.lastDecade = -1;
    this.updatePauseButton();
  }

  /** Called from a user gesture before entering XR so audio may start. */
  unlockAudio(): void {
    if (this.ready) void this.audio.unlock();
  }

  get isIdle(): boolean {
    return this.phase === 'idle';
  }

  private onVisibility(state: VisibilityState): void {
    if (state === VisibilityState.Visible) {
      // Entered (or returned to) the immersive session.
      this.needsAnchor = true;
      this.anchorDelay = 0.3;
      if (this.phase === 'idle') this.start();
      else this.autoResume();
    } else if (state === VisibilityState.VisibleBlurred) {
      // System menu over the app: pause cleanly, resume when it closes.
      this.autoPause();
    } else if (state === VisibilityState.NonImmersive) {
      this.needsAnchor = true;
      this.anchorDelay = 0;
    }
  }

  private autoPause(): void {
    if (this.phase === 'playing' && !this.clock.paused) {
      this.autoPaused = true;
      this.setPaused(true);
    }
  }

  private autoResume(): void {
    if (this.autoPaused) {
      this.autoPaused = false;
      this.setPaused(false);
    }
  }

  private setPaused(paused: boolean): void {
    this.clock.paused = paused;
    this.audio.setPaused(paused);
    if (paused) this.narration.stop();
    this.updatePauseButton();
  }

  private wirePanel(): void {
    const on = (id: string, fn: () => void) => {
      const el = this.handPanel.requireElementById(id);
      el.name = id;
      const handler = () => {
        void this.audio.unlock(); // any press counts as the audio-unlock gesture
        fn();
      };
      el.addEventListener('click', handler);
      this.cleanupFuncs.push(() => el.removeEventListener('click', handler));
    };
    on('btn-pause', () => {
      if (this.phase === 'today' || this.phase === 'idle') this.start();
      else this.setPaused(!this.clock.paused);
    });
    on('btn-voice', () => {
      this.narration.enabled = !this.narration.enabled;
      if (!this.narration.enabled) this.narration.stop();
      else if (this.caption) this.narration.speak(`${this.caption.label}. ${this.caption.text}`);
      this.handPanel.requireElementById('label-voice').setProperties({ text: this.narration.enabled ? 'Voice on' : 'Voice' });
    });
    if (!this.narration.available) this.handPanel.requireElementById('btn-voice').setProperties({ display: 'none' });
    CHAPTERS.forEach((ch, i) => on(`ch-${i}`, () => this.jumpTo(this.timeline.indexOf(ch.date))));
  }

  private updatePauseButton(): void {
    if (!this.handPanel) return;
    const showPlay = this.phase !== 'playing' || this.clock.paused;
    const label = this.phase === 'today' ? 'Replay' : this.phase === 'idle' ? 'Start' : this.clock.paused ? 'Play' : 'Pause';
    this.handPanel.requireElementById('label-pause').setProperties({ text: label });
    this.handPanel.requireElementById('icon-pause').setProperties({ display: showPlay ? 'none' : 'flex' });
    this.handPanel.requireElementById('icon-play').setProperties({ display: showPlay ? 'flex' : 'none' });
  }

  private jumpTo(index: number): void {
    if (this.phase === 'idle') this.start();
    this.audio.dip();
    this.clock.seek(index);
    this.clock.paused = false;
    this.audio.setPaused(false);
    this.autoPaused = false;
    this.phase = 'playing';
    this.resetMoments(index);
    this.captionQueue.length = 0;
    this.caption = null;
    this.showCaption(null);
    this.lastDecade = -1;
    this.updatePauseButton();
  }

  private resetMoments(index: number): void {
    for (const m of this.moments) m.fired = m.trigger < index - 0.5;
    this.hintShown = this.hintShown || index > this.hintIndex;
  }

  private toggleSolo(index: number): void {
    if (index < 0 || !this.ready) return;
    void this.audio.unlock();
    this.solo = this.solo === index ? -1 : index;
    this.audio.setSolo(this.solo);
    this.infoTimer = 0;
    if (this.solo < 0) this.infoCard.hide();
  }

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------

  update(delta: number): void {
    if (!this.ready) return;
    const dt = Math.min(delta, 0.1);
    this.anchorIfNeeded(dt);

    if (this.phase === 'playing' && !this.clock.paused) {
      this.clock.advance(dt);
      this.fireMoments();
      if (this.clock.ended) this.enterToday();
    }
    const p = this.clock.position;
    const flowing = this.phase === 'playing' && !this.clock.paused;

    this.updateCaptions(dt);
    this.updateYear(p, flowing);
    for (let i = 0; i < this.focus.length; i++) this.focus[i] = Math.max(0, this.focus[i] - dt / FOCUS_HOLD_S);

    if (this.phase === 'today' && this.today) this.applyToday();
    else this.applyPosition(p, dt);

    const turb = this.phase === 'today' ? 0.15 : Timeline.sample(this.timeline.turbulence, p);
    const floatBlend = Math.min(1, Math.max(0, (p - this.floatStartIndex + 20) / 40));
    this.audio.update(this.voiceInputs, turb, floatBlend, flowing);
    this.ambience.update(dt, turb);
    this.orbs.forEach((o, i) => o.update(dt, this.orbStates[i]));

    // Keep each voice positioned at its orb (10 Hz is plenty).
    this.audioPosTimer -= dt;
    if (this.audioPosTimer <= 0) {
      this.audioPosTimer = 0.1;
      this.orbs.forEach((o, i) => {
        o.core.getWorldPosition(this.v1);
        this.audio.setVoicePosition(i, this.v1.x, this.v1.y, this.v1.z);
      });
    }
    this.updateInfoCard(dt, p);
  }

  /** Per-slot numbers at week p -> orb + voice inputs. */
  private applyPosition(p: number, _dt: number): void {
    const tl = this.timeline;
    tl.slots.forEach((s, i) => {
      const alive = p >= s.first;
      const strength = alive ? Timeline.sample(s.strength, p) : 0;
      const momentum = alive ? Timeline.sample(s.momentum, p) : 0;
      const vol = alive ? Timeline.sample(s.vol, p) : 0;
      this.fill(i, alive, strength, momentum, vol, tl.codeAt(i, p));
    });
  }

  private fill(i: number, alive: boolean, strength: number, momentum: number, vol: number, code: string): void {
    const os = this.orbStates[i];
    os.alive = alive;
    os.height = LAYOUT.heightRange * Math.tanh(strength / 1.0);
    os.brightness = 0.5 + 0.5 * Math.tanh(momentum * 6);
    os.focus = Math.max(this.focus[i], this.solo === i ? 1 : 0);
    os.code = code;
    const vi = this.voiceInputs[i];
    vi.alive = alive;
    vi.degree = SLOTS[i].register + strengthToSteps(strength);
    vi.vol = vol;
  }

  private fireMoments(): void {
    const p = this.clock.position;
    if (!this.hintShown && p >= this.hintIndex) {
      this.hintShown = true;
      const [minS, maxS] = CAPTION_TIMES.hint;
      this.enqueue({ label: '', text: HINT_TEXT, minS, maxS, hint: true });
    }
    for (const m of this.moments) {
      if (m.fired || p < m.trigger) continue;
      m.fired = true;
      const e = m.event;
      const [minS, maxS] = CAPTION_TIMES[e.tier];
      this.enqueue({ label: e.label, text: e.text, minS, maxS });
      for (const slot of e.focus) {
        const i = SLOTS.findIndex((s) => s.slot === slot);
        if (i >= 0) this.focus[i] = 1;
      }
      if (e.tier === 'major') {
        this.audio.gong();
        this.ambience.markEvent();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Captions & year
  // -------------------------------------------------------------------------

  private enqueue(c: Caption): void {
    this.captionQueue.push(c);
  }

  private updateCaptions(dt: number): void {
    // Captions do not age while paused, so there is time to read.
    if (!this.clock.paused) this.captionAge += dt;
    const c = this.caption;
    const waiting = this.captionQueue.length > 0;
    if (c && (this.captionAge >= c.maxS || (waiting && this.captionAge >= c.minS))) {
      this.caption = null;
      this.showCaption(null);
    }
    if (!this.caption && waiting) {
      this.caption = this.captionQueue.shift()!;
      this.captionAge = 0;
      this.showCaption(this.caption);
      this.narration.speak(this.caption.label ? `${this.caption.label}. ${this.caption.text}` : this.caption.text);
    }
  }

  private showCaption(c: Caption | null): void {
    const box = this.captionPanel.requireElementById('caption-box');
    const hint = this.captionPanel.requireElementById('hint-box');
    if (!c) {
      box.setProperties({ display: 'none' });
      hint.setProperties({ display: 'none' });
      return;
    }
    if (c.hint) {
      box.setProperties({ display: 'none' });
      this.captionPanel.requireElementById('hint-text').setProperties({ text: c.text });
      hint.setProperties({ display: 'flex' });
    } else {
      hint.setProperties({ display: 'none' });
      this.captionPanel.requireElementById('caption-label').setProperties({ text: c.label });
      this.captionPanel.requireElementById('caption-text').setProperties({ text: c.text });
      box.setProperties({ display: 'flex' });
    }
  }

  private updateYear(p: number, flowing: boolean): void {
    if (this.phase === 'today') return;
    const year = this.timeline.dateAt(p).getUTCFullYear();
    if (year !== this.lastYear) {
      this.lastYear = year;
      this.captionPanel.requireElementById('year-text').setProperties({ text: String(year) });
    }
    const decade = Math.floor(year / 10);
    if (flowing && this.lastDecade >= 0 && decade !== this.lastDecade) this.audio.decadeChime();
    this.lastDecade = decade;
  }

  // -------------------------------------------------------------------------
  // Today (ending)
  // -------------------------------------------------------------------------

  private enterToday(): void {
    this.phase = 'today';
    this.updatePauseButton();
    void (this.todayPromise ?? Promise.resolve(null)).then((today) => {
      this.today = today;
      this.captionPanel.requireElementById('year-text').setProperties({ text: 'Today' });
      const when = today ? formatDate(today.asOf) : formatDate(this.timeline.dateAt(this.timeline.count - 1).toISOString().slice(0, 10));
      const saved = today?.source === 'bundled' ? ' (latest saved rates)' : '';
      this.captionQueue.length = 0;
      this.caption = null;
      this.enqueue({
        label: `${when}${saved}`,
        text: 'This is the world of money right now. Pinch a light to hear how it moved since yesterday.',
        minS: 30,
        maxS: 1e9,
      });
      if (today) this.rollCall(today);
    });
  }

  /** Map today's live rates onto the orbs (strength since each one's birth). */
  private applyToday(): void {
    const today = this.today!;
    this.timeline.slots.forEach((s, i) => {
      const r = this.todayRate(i, today);
      if (!r) return;
      const strength = Math.log(s.firstRate / r.rate);
      const daily = Math.log(r.prev / r.rate);
      this.fill(i, true, strength, daily * 40, 0, r.code);
    });
  }

  private todayRate(i: number, today: TodayData): { code: string; rate: number; prev: number } | null {
    const s = this.timeline.slots[i];
    const code = s.segments[s.segments.length - 1].code;
    const r = today.rates[code];
    if (!r) return null;
    // The EUR slot's history is in Deutsche Mark units; convert today's euro.
    const k = s.segments.length > 1 ? s.chainFactor : 1;
    return { code, rate: r.rate * k, prev: r.prev * k };
  }

  /** Each currency speaks once, left to right: a rising or falling grace note
   *  says whether it gained or lost against the dollar since yesterday. */
  private rollCall(today: TodayData): void {
    const t0 = this.audio.ctx.currentTime + 1.2;
    SLOTS.forEach((meta, i) => {
      const r = this.todayRate(i, today);
      if (!r) return;
      const strength = Math.log(this.timeline.slots[i].firstRate / r.rate);
      const degree = meta.register + strengthToSteps(strength);
      const change = r.prev / r.rate - 1;
      const when = t0 + i * 0.45;
      this.audio.scheduleNote(i, degree, 0.6, when);
      if (Math.abs(change) > 0.0002) this.audio.scheduleNote(i, degree + (change > 0 ? 1 : -1), 0.45, when + 0.2);
    });
  }

  // -------------------------------------------------------------------------
  // Solo info card
  // -------------------------------------------------------------------------

  private updateInfoCard(dt: number, p: number): void {
    if (this.solo < 0) return;
    const orb = this.orbs[this.solo];
    orb.group.getWorldPosition(this.v1);
    this.rig.object3D!.worldToLocal(this.v1);
    // Float the card just above the orb, nudged toward the user.
    this.v2.copy(this.v1).multiplyScalar(0.92);
    this.infoCard.mesh.position.set(this.v2.x, this.v1.y + 0.1, this.v2.z);
    this.infoCard.mesh.rotation.y = orb.group.rotation.y;

    this.infoTimer -= dt;
    if (this.infoTimer > 0) return;
    this.infoTimer = 0.25;
    const i = this.solo;
    const s = this.timeline.slots[i];
    const meta = SLOTS[i];
    if (this.phase === 'today' && this.today) {
      const r = this.todayRate(i, this.today);
      if (r) {
        const pct = (r.prev / r.rate - 1) * 100;
        this.infoCard.show(`${r.code}  ${meta.names[r.code] ?? ''}`, `${signed(pct, 2)}% vs ${BASE_CURRENCY.code} since yesterday`, meta.color);
        return;
      }
    }
    const code = this.timeline.codeAt(i, p);
    const name = meta.names[code] ?? code;
    if (p < s.first) {
      const from = this.timeline.dateAt(s.first).getUTCFullYear();
      this.infoCard.show(`${code}  ${name}`, `Data begins in ${from}`, meta.color);
      return;
    }
    const pct = (Math.exp(Timeline.sample(s.strength, p)) - 1) * 100;
    const since = this.timeline.dateAt(s.first).getUTCFullYear();
    this.infoCard.show(`${code}  ${name}`, `${signed(pct, 0)}% vs ${BASE_CURRENCY.code} since ${since}`, meta.color);
  }

  // -------------------------------------------------------------------------
  // Placement
  // -------------------------------------------------------------------------

  /** Center the rig on the user's head (position + facing) once tracking is valid. */
  private anchorIfNeeded(dt: number): void {
    if (!this.needsAnchor) return;
    this.anchorDelay -= dt;
    if (this.anchorDelay > 0) return;
    const cam = this.world.camera;
    cam.getWorldPosition(this.v1);
    if (this.world.session && this.v1.y < 0.3) return; // pose not ready yet
    cam.getWorldDirection(this.v2);
    const rig = this.rig.object3D!;
    rig.position.copy(this.v1);
    rig.rotation.set(0, Math.atan2(-this.v2.x, -this.v2.z), 0);
    this.needsAnchor = false;
  }

  /** Our PannerNodes need a listener on the head; reuse IWSDK's if present. */
  private ensureListener(): void {
    let found = false;
    this.world.scene.traverse((o) => {
      if (o.type === 'AudioListener') found = true;
    });
    if (!found) this.world.camera.add(new AudioListener());
  }
}

function signed(x: number, digits: number): string {
  const s = Math.abs(x).toFixed(digits);
  return x >= 0 ? `+${s}` : `-${s}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
