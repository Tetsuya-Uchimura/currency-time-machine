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
  type Object3D,
  PokeInteractable,
  Quaternion,
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
import { Orb, PortalTarget } from './components.js';
import { BASE_CURRENCY, LAYOUT, SLOTS, strengthToHeight, TRAIL } from './config.js';
import { CHAPTERS, EVENTS, FLOAT_START, HINT_TEXT, type HistoryEvent } from './data/events.js';
import { PORTAL_SCENES } from './data/portals.js';
import { Timeline } from './data/timeline.js';
import { loadToday, type TodayData } from './data/today.js';
import { DEFAULT_PACING, PlaybackClock, slowDownsFor } from './playback/clock.js';
import { PortalDirector } from './playback/portal-director.js';
import { Ambience } from './visual/ambience.js';
import { HistoricalPortals } from './visual/historical-portals.js';
import { createGuides, OrbView, type OrbState } from './visual/orbs.js';
import type { TrailTail } from './visual/trail-sampling.js';
import { TrailField } from './visual/trails.js';

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
  /** Week index of the event's actual date. */
  at: number;
  /** Week index at which the caption appears (a little before `at`). */
  trigger: number;
  fired: boolean;
  /** The playhead has reached the actual date (the gong rings here). */
  dated: boolean;
  /** This event has a Historical Portal (which then owns the sky tint). */
  portal: boolean;
}

/** Weeks before a major event at which its caption (and portal) appear. */
const MAJOR_LEAD = 16;
const MINOR_LEAD = 3;

/** Shortest a caption stays when another is waiting, and its natural length. */
const CAPTION_TIMES = { major: [4.5, 7.5], minor: [3.5, 6], hint: [5, 7] } as const;
const FOCUS_HOLD_S = 5;

export class ExperienceSystem extends createSystem({
  pressedOrbs: { required: [Orb, Pressed] },
  pressedPortal: { required: [PortalTarget, Pressed] },
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
  private trails!: TrailField;
  private portals!: HistoricalPortals;
  private director!: PortalDirector;
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
  private debugTimer = 5;
  private debugFrames = 0;
  /** Dev only: no dt cap (screenshots from a throttled emulator window). */
  private devRealtime = false;
  private debugSince = 0;
  private infoTimer = 0;
  /** Today's rates have been applied to the trails (morph done once). */
  private todayApplied = false;

  // Reused per-frame objects (no allocations in update()).
  private readonly voiceInputs: VoiceInput[] = SLOTS.map(() => ({ alive: false, degree: 0, vol: 0 }));
  private readonly orbStates: OrbState[] = SLOTS.map(() => ({ alive: false, height: 0, brightness: 0, focus: 0, dim: 0, code: '' }));
  /** Trail heads (week index) per slot; they differ only in the today ending. */
  private readonly trailHeads = new Float64Array(SLOTS.length);
  private readonly trailTails: (TrailTail | null)[] = SLOTS.map(() => null);
  private readonly orbHeights: number[] = SLOTS.map(() => 0);
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly q1 = new Quaternion();
  private readonly q2 = new Quaternion();
  private listener: Object3D | null = null;

  init(): void {
    this.cleanupFuncs.push(
      this.queries.pressedOrbs.subscribe('qualify', (entity) => {
        this.toggleSolo(entity.getValue(Orb, 'slotIndex') ?? -1);
      }),
      this.queries.pressedPortal.subscribe('qualify', () => {
        void this.audio?.unlock();
        this.portals?.toggleDetails();
      }),
      this.world.visibilityState.subscribe((state) => this.onVisibility(state)),
    );
    const onHidden = () => {
      if (document.hidden) this.autoPause();
      else this.autoResume();
    };
    document.addEventListener('visibilitychange', onHidden);
    this.cleanupFuncs.push(() => document.removeEventListener('visibilitychange', onHidden));
    if (import.meta.env.DEV) this.devKeys();
  }

  /**
   * Dev only (stripped from production builds): keyboard shortcuts so the
   * emulator can be driven by automation and demo clips are easy to set up.
   *   1-5 chapters   g h j k l b n m , solo CAD..AUD   p pause
   *   6 before the Asian crisis   7 before the 2022 yen slide   0 before the 1985 moment
   *   8 near the end   9 replay   c no frame-time cap (throttled emulator)
   * (W/A/S/D and the arrows are left alone: the emulator moves the head with them.)
   */
  private devKeys(): void {
    const soloKeys = 'ghjklbnm,';
    const onKey = (e: KeyboardEvent) => {
      if (!this.ready) return;
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '5') this.jumpTo(this.timeline.indexOf(CHAPTERS[Number(k) - 1].date));
      else if (soloKeys.includes(k)) this.toggleSolo(soloKeys.indexOf(k));
      else if (k === 'p' && this.phase === 'playing') this.setPaused(!this.clock.paused);
      else if (k === 'c') this.devRealtime = !this.devRealtime;
      else if (k === '8') this.jumpTo(this.timeline.count - 40);
      else if (k === '9') this.start();
      else if (k === '6') this.jumpTo(this.timeline.indexOf('1997-08-01'));
      else if (k === '7') this.jumpTo(this.timeline.indexOf('2022-01-07'));
      else if (k === '0') this.jumpTo(this.timeline.indexOf('1985-04-26'));
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));
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
      const lead = event.tier === 'major' ? MAJOR_LEAD : MINOR_LEAD;
      const portal = PORTAL_SCENES.some((sc) => sc.eventId === event.id);
      return { event, at, trigger: Math.max(0, at - lead), fired: false, dated: false, portal };
    });
    this.hintIndex = timeline.indexOf('1951-06-01');
    this.focus = SLOTS.map(() => 0);

    this.audio = new SoundEngine(SLOTS.map((s) => s.timbre));
    // Fires when the note is actually heard (not when it is booked).
    this.audio.onNote((i, velocity) => {
      this.orbs[i]?.pulse(velocity);
      this.trails?.note(i, velocity);
    });
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

    // Temporal light trails: each orb drags its past year as a ribbon of light.
    this.trails = new TrailField(
      timeline.slots,
      SLOTS.map((s) => s.color),
      angles,
      (year) => timeline.indexOf(`${year}-01-01`),
      (index) => timeline.dateAt(index).getUTCFullYear(),
    );
    this.world.createTransformEntity(this.trails.root, { parent: this.rig });

    // Historical Portals: windows onto the era, far behind everything else.
    this.director = new PortalDirector(
      PORTAL_SCENES.map((sc) => {
        const at = timeline.indexOf(sc.eventDate);
        // The next caption after this event (any tier) closes the window.
        const closeBy = Math.min(...this.moments.filter((m) => m.at > at + 0.5).map((m) => m.trigger));
        return { at, lead: MAJOR_LEAD, closeBy };
      }),
    );
    this.portals = new HistoricalPortals(PORTAL_SCENES, (t) => this.world.renderer.initTexture(t));
    const portalEntity = this.world.createTransformEntity(this.portals.root, { parent: this.rig });
    const portalHit = this.world.createTransformEntity(this.portals.hit, { parent: portalEntity });
    portalHit.addComponent(PortalTarget);
    portalHit.addComponent(RayInteractable); // 1.7 m away: pinch from afar

    // Caption board: ahead and above the orbs, large type.
    this.captionPanel = await this.world.assets.instantiate<UIKitMLAsset>('caption-panel');
    // High enough that even the strongest orb (CHF) never overlaps it.
    this.captionPanel.position.set(0, 0.42, -1.1);
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
    this.morphTrails();
    this.clock.paused = false;
    this.clock.seek(0);
    this.resetMoments(0);
    this.director.seek(0);
    this.portals.hideDetails();
    this.phase = 'playing';
    this.lastDecade = -1;
    this.lastYear = -1;
    // Replay: nothing from the previous run may linger (the today caption
    // never times out on its own, the solo lane, event highlights).
    this.captionQueue.length = 0;
    this.caption = null;
    this.showCaption(null);
    this.narration.stop();
    this.today = null;
    this.todayApplied = false;
    this.focus.fill(0);
    this.trails.reset();
    this.trailTails.fill(null);
    if (this.solo >= 0) this.toggleSolo(this.solo);
    this.autoPaused = false;
    this.updatePauseButton();
  }

  /** The playhead is about to jump: let trails and orbs glide to the new time. */
  private morphTrails(): void {
    this.orbs.forEach((o, i) => (this.orbHeights[i] = o.displayHeight));
    this.trails.beginMorph(this.orbHeights);
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
    this.morphTrails();
    this.trailTails.fill(null);
    this.todayApplied = false;
    this.clock.seek(index);
    this.director.seek(this.clock.position);
    this.portals.hideDetails();
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
    // A moment counts as past only once its actual date is behind us: jumping
    // in between the caption's early trigger and the date (e.g. the 1971
    // chapter) still shows the caption, and the gong still rings on the date.
    for (const m of this.moments) {
      m.fired = m.at < index - 0.5;
      m.dated = m.fired;
    }
    this.hintShown = this.hintShown || index > this.hintIndex;
  }

  private toggleSolo(index: number): void {
    if (index < 0 || !this.ready) return;
    void this.audio.unlock();
    this.solo = this.solo === index ? -1 : index;
    this.audio.setSolo(this.solo);
    // The visual half of solo: the expanded light lane.
    this.trails.setExpanded(this.solo);
    this.infoTimer = 0;
  }

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------

  update(delta: number): void {
    if (!this.ready) return;
    // (Dev: 'c' lifts the cap so a throttled, backgrounded emulator still plays in real time.)
    const dt = Math.min(delta, this.devRealtime ? 1 : 0.1);
    this.anchorIfNeeded(dt);
    this.syncListener();

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

    this.trailHeads.fill(p);
    if (this.phase === 'today' && this.today) this.applyToday();
    else this.applyPosition(p, dt);

    const turb = this.phase === 'today' ? 0.15 : Timeline.sample(this.timeline.turbulence, p);
    const floatBlend = Math.min(1, Math.max(0, (p - this.floatStartIndex + 20) / 40));
    this.trails.update(dt, { heads: this.trailHeads, tails: this.trailTails, focus: this.focus, turbulence: turb });
    this.updatePortals(dt, p, flowing);
    // Each orb rides exactly on the head of its trail.
    for (let i = 0; i < this.orbStates.length; i++) this.orbStates[i].height = this.trails.headY(i);
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
    this.updateLaneText(dt, p);
    if (import.meta.env.DEV) this.logDiagnostics(dt, p);
  }

  /** Dev only: lets us confirm the (inaudible to CI) audio graph is alive. */
  private logDiagnostics(dt: number, p: number): void {
    this.debugFrames++;
    this.debugTimer -= dt;
    if (this.debugTimer > 0) return;
    this.debugTimer = 5;
    const now = performance.now();
    const fps = (this.debugFrames * 1000) / Math.max(1, now - this.debugSince);
    this.debugFrames = 0;
    this.debugSince = now;
    const l = this.audio.ctx.listener;
    const year = this.timeline.dateAt(p).getUTCFullYear();
    const line =
      `[ctm] phase=${this.phase} year=${year} paused=${this.clock.paused} audio=${this.audio.ctx.state} ` +
      `notes=${this.audio.noteCount} fps=${fps.toFixed(0)} portal=${this.portals.debug} listener=(${l.positionX.value.toFixed(2)},${l.positionY.value.toFixed(2)},${l.positionZ.value.toFixed(2)})`;
    console.info(line);
    // Also mirror into a hidden status element (readable by automation snapshots).
    let el = document.getElementById('ctm-debug');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ctm-debug';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(el);
    }
    el.textContent = line;
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
    os.height = strengthToHeight(strength); // replaced by the trail head each frame
    os.brightness = 0.5 + 0.5 * Math.tanh(momentum * 6);
    os.focus = Math.max(this.focus[i], this.solo === i ? 1 : 0);
    os.dim = this.solo >= 0 && this.solo !== i ? 1 : 0;
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
      const at = this.timeline.indexOf(e.date);
      for (const slot of e.focus) {
        const i = SLOTS.findIndex((s) => s.slot === slot);
        if (i < 0) continue;
        this.focus[i] = 1;
        // A warm marker pinned to the event's date on that currency's trail;
        // it appears when time reaches the date and then flows away with the
        // history, so the moves that followed are drawn right after it.
        this.trails.markEvent(i, at);
      }
      if (e.tier === 'major') {
        // Portal events tint the sky when their window opens (same moment).
        if (!m.portal) this.ambience.markEvent();
        this.trails.boostAll();
      }
    }
    // The actual date of a major event: the gong rings and the currencies it
    // touched are highlighted again, as the real moves begin.
    for (const m of this.moments) {
      if (m.dated || p < m.at || m.event.tier !== 'major') continue;
      m.dated = true;
      this.audio.gong();
      this.trails.boostAll();
      for (const slot of m.event.focus) {
        const i = SLOTS.findIndex((s) => s.slot === slot);
        if (i >= 0) this.focus[i] = 1;
      }
    }
  }

  /** Open, animate and close the Historical Portals. */
  private updatePortals(dt: number, p: number, flowing: boolean): void {
    const playing = this.phase === 'playing';
    const st = this.director.update(p, dt, playing && flowing);
    const index = playing ? st.index : -1;
    if (index >= 0 && st.justOpened) {
      const scene = PORTAL_SCENES[index];
      this.audio.shimmer();
      this.ambience.markEvent(scene.tint);
      for (const slot of scene.affectedSlots) {
        const i = SLOTS.findIndex((s) => s.slot === slot);
        if (i >= 0) this.focus[i] = Math.max(this.focus[i], 0.8);
      }
    }
    // Prepare the next window's textures well before it is needed.
    if (playing) this.portals.prefetch(this.director.upcoming(p, 120));
    this.portals.update(dt, {
      index,
      appear: st.appear,
      highlight: st.highlight,
      out: st.out,
      flowing: playing && flowing,
      laneVisible: this.trails.laneVisibility,
    });
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
      if (this.phase !== 'today') return; // Replay was pressed meanwhile
      this.today = today;
      this.captionPanel.requireElementById('year-text').setProperties({ text: 'Today' });
      this.captionQueue.length = 0;
      this.caption = null;
      this.enqueue({ ...this.todayCaption(today), minS: 30, maxS: 1e9 });
      if (today) this.rollCall(today);
    });
  }

  /**
   * The ending's caption. It says plainly when the rates are a saved copy
   * (and when that copy was fetched), and when currencies' latest rates come
   * from different days, so they are not mistaken for one live moment.
   */
  private todayCaption(today: TodayData | null): { label: string; text: string } {
    if (!today) {
      const last = this.timeline.dateAt(this.timeline.count - 1).toISOString().slice(0, 10);
      return { label: formatDate(last), text: 'Live rates are unavailable. This is the last week in our history.' };
    }
    const dates = SLOTS.map((_, i) => this.todayRate(i, today)?.date).filter((d): d is string => !!d);
    const earliest = dates.reduce((m, d) => (d < m ? d : m), today.asOf);
    const mixed = earliest !== today.asOf;
    const bundled = today.source === 'bundled';
    const label = bundled ? `Saved rates from ${formatFetched(today.fetchedAt ?? today.asOf)}` : formatDate(today.asOf);
    let text: string;
    if (mixed) text = `Each light shows its latest rate; some are from ${formatShort(earliest)}. Pinch one for details.`;
    else if (bundled) text = 'Live rates are unavailable right now. Pinch a light to hear its latest move.';
    else text = 'This is the world of money right now. Pinch a light to hear how it moved since yesterday.';
    return { label, text };
  }

  /** Map today's live rates onto the orbs (strength since each one's birth). */
  private applyToday(): void {
    const today = this.today!;
    const last = this.timeline.count - 1;
    if (!this.todayApplied) this.morphTrails(); // glide from the last week to today
    this.timeline.slots.forEach((s, i) => {
      const r = this.todayRate(i, today);
      if (!r) return;
      const strength = Math.log(s.firstRate / r.rate);
      const daily = Math.log(r.prev / r.rate);
      this.fill(i, true, strength, daily * 40, 0, r.code);
      // The trail ends at this currency's own latest date (not a shared
      // "today"), joined to the weekly history by a straight line between
      // two real observations.
      const at = Math.max(last, this.timeline.indexOf(r.date));
      this.trailHeads[i] = at;
      this.trailTails[i] = { index: at, value: strength };
    });
    this.todayApplied = true;
  }

  private todayRate(i: number, today: TodayData): { code: string; rate: number; prev: number; date: string; prevDate: string } | null {
    const s = this.timeline.slots[i];
    const code = s.segments[s.segments.length - 1].code;
    const r = today.rates[code];
    if (!r) return null;
    // The EUR slot's history is in Deutsche Mark units; convert today's euro.
    const k = s.segments.length > 1 ? s.chainFactor : 1;
    return { code, rate: r.rate * k, prev: r.prev * k, date: r.date, prevDate: r.prevDate };
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
  // Solo lane text
  // -------------------------------------------------------------------------

  /** Name and numbers for the expanded lane (a few times a second). */
  private updateLaneText(dt: number, p: number): void {
    if (this.solo < 0) return;
    this.infoTimer -= dt;
    if (this.infoTimer > 0) return;
    this.infoTimer = 0.25;
    const i = this.solo;
    const s = this.timeline.slots[i];
    const meta = SLOTS[i];
    const base = BASE_CURRENCY.code;
    const months = Math.round((TRAIL.windowWeeks * 7) / 30.44);

    if (this.phase === 'today' && this.today) {
      const r = this.todayRate(i, this.today);
      if (r) {
        const day = (r.prev / r.rate - 1) * 100;
        const w = this.trails.windowInfo(i);
        this.trails.setLaneText(
          `${r.code}  ${meta.names[r.code] ?? ''}`,
          w ? `${signed(w.pct, 1)}% vs ${base} in ${months} months` : '',
          `${formatShort(r.prevDate)} to ${formatShort(r.date)}: ${signed(day, 2)}% vs ${base}`,
        );
        return;
      }
    }
    const code = this.timeline.codeAt(i, p);
    const title = `${code}  ${meta.names[code] ?? code}`;
    if (p < s.first) {
      const from = this.timeline.dateAt(s.first).getUTCFullYear();
      this.trails.setLaneText(title, '', `Data begins in ${from}`);
      return;
    }
    const w = this.trails.windowInfo(i);
    const since = this.timeline.dateAt(s.first).getUTCFullYear();
    const total = (Math.exp(Timeline.sample(s.strength, p)) - 1) * 100;
    // When the window reaches back before the data starts, say so.
    const clipped = w !== null && w.fromT > p - TRAIL.windowWeeks + 0.5;
    const stat = w ? `${signed(w.pct, 1)}% vs ${base} ${clipped ? `since ${since}` : `in ${months} months`}` : '';
    this.trails.setLaneText(title, stat, `Since ${since}: ${signed(total, 0)}% vs ${base}`);
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
    this.world.scene.traverse((o) => {
      if (!this.listener && o.type === 'AudioListener') this.listener = o;
    });
    if (!this.listener) {
      this.listener = new AudioListener();
      this.world.camera.add(this.listener);
    }
  }

  /**
   * In XR the listener rides on the tracked head. In the browser the camera is
   * placed by the render config while the head stays at the origin, so we move
   * the listener onto the camera to keep sound directions right.
   */
  private syncListener(): void {
    const l = this.listener;
    if (!l || !l.parent || l.parent === this.world.camera) return;
    if (this.world.session) {
      if (l.position.lengthSq() > 0) {
        l.position.set(0, 0, 0);
        l.quaternion.identity();
      }
      return;
    }
    const cam = this.world.camera;
    cam.getWorldPosition(this.v1);
    l.parent.worldToLocal(this.v1);
    l.position.copy(this.v1);
    cam.getWorldQuaternion(this.q1);
    l.parent.getWorldQuaternion(this.q2);
    l.quaternion.copy(this.q2.invert().multiply(this.q1));
  }
}

function signed(x: number, digits: number): string {
  const s = Math.abs(x).toFixed(digits);
  return x >= 0 ? `+${s}` : `-${s}`;
}

/** "Nov 6" */
function formatShort(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Nov 8, 22:50 UTC" (short enough for one caption line), or a plain date. */
function formatFetched(iso: string): string {
  if (iso.length <= 10) return formatShort(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatShort(d.toISOString())}, ${d.toISOString().slice(11, 16)} UTC`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
