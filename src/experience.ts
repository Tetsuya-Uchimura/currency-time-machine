/**
 * ExperienceSystem: the conductor. Each frame it advances the one playback
 * clock and feeds the same moment to all three bands and the sound:
 *
 *   events band  (top)     the era between events; a Historical Portal
 *                          (photos, people, policies) around major moments
 *   chart band   (middle)  nine lines of change vs USD on one shared scale
 *   map band     (bottom)  where each currency lives, with the same numbers
 *
 * Selection (solo) and event emphasis are one shared state: pinching a
 * currency on the map or on the chart highlights its line, its region and
 * its voice together; a historical event lights the same three.
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
import { BANDS, bandPitch, BASE_CURRENCY, CHART, HAND_PANEL, SLOTS, VOICES, type Band } from './config.js';
import { eraAt } from './data/eras.js';
import { CHAPTERS, EVENTS, FLOAT_START, HINT_TEXT, type HistoryEvent } from './data/events.js';
import { PORTAL_SCENES } from './data/portals.js';
import { CURRENCY_WORDS, readoutLine, type HistoryContent } from './data/history-content.js';
import { Timeline } from './data/timeline.js';
import { loadToday, type TodayData } from './data/today.js';
import type { WorldMapFile } from './data/world-map.js';
import { DEFAULT_PACING, PlaybackClock, slowDownsFor } from './playback/clock.js';
import { PortalDirector } from './playback/portal-director.js';
import { Ambience } from './visual/ambience.js';
import { EraPanel } from './visual/era-panel.js';
import { HistoricalPortals } from './visual/historical-portals.js';
import { MultiCurrencyChart, type ChartFrame } from './visual/multi-currency-chart.js';
import type { TrailTail } from './visual/trail-sampling.js';
import { WorldCurrencyMap, type MapFrame } from './visual/world-currency-map.js';

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
  /** Week index of the event's anchor date. */
  at: number;
  /** Week index at which the caption appears (a little before `at`). */
  trigger: number;
  fired: boolean;
  /** The playhead has reached the date (the gong rings here). */
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
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
  private chart!: MultiCurrencyChart;
  private map!: WorldCurrencyMap;
  private era!: EraPanel;
  private portals!: HistoricalPortals;
  private director!: PortalDirector;
  private ambience!: Ambience;
  private handPanel!: UIKitMLAsset;
  private chartBand!: Group;

  private moments: Moment[] = [];
  private hintShown = false;
  private hintIndex = 0;
  private floatStartIndex = 0;
  private captionQueue: Caption[] = [];
  private caption: Caption | null = null;
  private captionAge = 0;
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
  /** Today's rates have been applied to the chart (glide done once). */
  private todayApplied = false;
  private readoutTimer = 0;
  private monthKey = -2;

  // Reused per-frame objects (no allocations in update()).
  private readonly voiceInputs: VoiceInput[] = SLOTS.map(() => ({ alive: false, degree: 0, vol: 0 }));
  private readonly brightness: number[] = SLOTS.map(() => 0);
  private readonly codes: string[] = SLOTS.map((s) => s.slot);
  /** Playhead per slot (week index); they differ only in the today ending. */
  private readonly heads = new Float64Array(SLOTS.length);
  private readonly tails: (TrailTail | null)[] = SLOTS.map(() => null);
  private readonly pct: (number | null)[] = SLOTS.map(() => null);
  private readonly late: boolean[] = SLOTS.map(() => false);
  private firstYear: number[] = [];
  private readonly chartFrame: ChartFrame = {
    heads: this.heads,
    tails: this.tails,
    focus: this.focus,
    brightness: this.brightness,
    solo: -1,
    codes: this.codes,
    turbulence: 0,
  };
  private readonly mapFrame: MapFrame = {
    date: '1948-06-25',
    pct: this.pct,
    late: this.late,
    codes: this.codes,
    firstYear: [],
    focus: [],
    solo: -1,
    flowing: false,
  };
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
   *   8 near the end   9 replay   c no frame-time cap (throttled emulator)   v portal card
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
      else if (k === 'v') this.portals.toggleDetails();
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
  async setup(timeline: Timeline, content: HistoryContent | null = null, worldMap: WorldMapFile | null = null): Promise<void> {
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
    SLOTS.forEach(() => this.focus.push(0));
    this.firstYear = timeline.slots.map((s) => timeline.dateAt(s.first).getUTCFullYear());
    this.mapFrame.firstYear = this.firstYear;
    this.mapFrame.focus = this.focus;

    this.audio = new SoundEngine(SLOTS.map((s) => s.timbre));
    // Fires when the note is actually heard (not when it is booked).
    this.audio.onNote((i, velocity) => this.chart?.note(i, velocity));
    // Start fetching today's rates right away; the ending needs them later.
    // (Slot ids are also today's codes: the EUR slot ends as the euro.)
    this.todayPromise = loadToday(SLOTS.map((s) => s.slot));

    // Rig: everything is placed relative to the user's head at start.
    this.rig = this.world.createTransformEntity(new Group());
    this.ambience = new Ambience();
    this.world.createTransformEntity(this.ambience.sky, { parent: this.rig });
    this.world.createTransformEntity(this.ambience.motes, { parent: this.rig });

    // The actual day of each event (portal events: the decision's date).
    const actualDay = (e: HistoryEvent) => e.actual ?? content?.get(e.id)?.date ?? e.date;

    // Middle band: the Multi-Currency Timeline.
    this.chartBand = this.band(BANDS.chart);
    this.chart = new MultiCurrencyChart(
      timeline.slots,
      SLOTS.map((s) => s.color),
      EVENTS.map((e) => ({ t: timeline.indexOf(actualDay(e)), label: e.short })),
      (year) => timeline.indexOf(`${year}-01-01`),
      (index) => timeline.dateAt(index).getUTCFullYear(),
    );
    this.chartBand.add(this.chart.root);
    const chartEntity = this.world.createTransformEntity(this.chartBand, { parent: this.rig });
    this.chart.hits.forEach((hit, i) => this.pinchTarget(hit, i, chartEntity));

    // Bottom band: the Interactive World Currency Map.
    const mapBand = this.band(BANDS.map);
    this.map = new WorldCurrencyMap(
      SLOTS.map((s) => s.slot),
      SLOTS.map((s) => s.color),
    );
    if (worldMap) this.map.setLand(worldMap);
    mapBand.add(this.map.root);
    const mapEntity = this.world.createTransformEntity(mapBand, { parent: this.rig });
    this.map.hits.forEach((hit, i) => hit && this.pinchTarget(hit, i, mapEntity));

    // Top band: Historical Events (the era view, and the portals around major moments).
    const eventsBand = this.band(BANDS.events);
    this.era = new EraPanel(
      this.moments
        .filter((m) => m.event.tier === 'major')
        .map((m) => ({
          t: timeline.indexOf(actualDay(m.event)),
          year: actualDay(m.event).slice(0, 4),
          name: m.event.short,
          portal: m.portal,
        })),
      timeline.count - 1,
    );
    eventsBand.add(this.era.root);
    this.director = new PortalDirector(
      PORTAL_SCENES.map((sc) => {
        const at = timeline.indexOf(sc.eventDate);
        // The next caption after this event (any tier) closes the window.
        const closeBy = Math.min(...this.moments.filter((m) => m.at > at + 0.5).map((m) => m.trigger));
        return { at, lead: MAJOR_LEAD, closeBy };
      }),
    );
    const slotCss = Object.fromEntries(SLOTS.map((s) => [s.slot, '#' + s.color.toString(16).padStart(6, '0')]));
    this.portals = new HistoricalPortals(PORTAL_SCENES, content, (t) => this.world.renderer.initTexture(t), slotCss);
    eventsBand.add(this.portals.root);
    const eventsEntity = this.world.createTransformEntity(eventsBand, { parent: this.rig });
    const portalHit = this.world.createTransformEntity(this.portals.hit, { parent: eventsEntity });
    portalHit.addComponent(PortalTarget);
    portalHit.addComponent(RayInteractable); // 1.4 m away: pinch from afar

    // Hand panel: low and close like a lap tray, below the map.
    this.handPanel = await this.world.assets.instantiate<UIKitMLAsset>('hand-panel');
    this.handPanel.position.set(0, HAND_PANEL.y, -HAND_PANEL.z);
    this.handPanel.rotation.x = HAND_PANEL.tiltRad;
    this.handPanel.scale.setScalar(0.1);
    const panelEntity = this.world.createTransformEntity(this.handPanel, { parent: this.rig });
    panelEntity.addComponent(RayInteractable);
    panelEntity.addComponent(PokeInteractable);
    this.wirePanel();

    this.ensureListener();
    this.applyPosition(0);
    this.ready = true;
  }

  /** A band group placed straight ahead and turned toward the head (see config BANDS). */
  private band(b: Band): Group {
    const g = new Group();
    g.position.set(0, b.y, -b.z);
    g.rotation.x = bandPitch(b);
    return g;
  }

  /** A currency's pinch target (on the map or the chart): pinch from afar or touch. */
  private pinchTarget(object: Object3D, slot: number, parent: Entity): void {
    const e = this.world.createTransformEntity(object, { parent });
    e.addComponent(Orb, { slotIndex: slot });
    e.addComponent(RayInteractable);
    e.addComponent(PokeInteractable);
  }

  // -------------------------------------------------------------------------
  // Lifecycle & input
  // -------------------------------------------------------------------------

  /** Start the time-lapse from 1948 (from XR entry, a click, or Replay). */
  start(): void {
    if (!this.ready) return;
    void this.audio.unlock().then(() => this.audio.setPaused(false));
    this.chart.beginMorph();
    this.clock.paused = false;
    this.clock.seek(0);
    this.resetMoments(0);
    this.director.seek(0);
    this.portals.hideDetails();
    this.clock.rate = 1;
    this.phase = 'playing';
    this.lastDecade = -1;
    // Replay: nothing from the previous run may linger (the today caption
    // never times out on its own, the solo, event highlights).
    this.captionQueue.length = 0;
    this.caption = null;
    this.showCaption(null);
    this.narration.stop();
    this.today = null;
    this.todayApplied = false;
    this.focus.fill(0);
    this.chart.reset();
    this.tails.fill(null);
    if (this.solo >= 0) this.toggleSolo(this.solo);
    this.autoPaused = false;
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
    this.chart.beginMorph();
    this.tails.fill(null);
    this.todayApplied = false;
    this.clock.seek(index);
    this.director.seek(this.clock.position);
    this.portals.hideDetails();
    this.clock.paused = false;
    this.audio.setPaused(false);
    this.autoPaused = false;
    this.phase = 'playing';
    this.resetMoments(index);
    this.focus.fill(0);
    this.captionQueue.length = 0;
    this.caption = null;
    this.showCaption(null);
    this.lastDecade = -1;
    this.updatePauseButton();
  }

  private resetMoments(index: number): void {
    // A moment counts as past only once its date is behind us: jumping in
    // between the caption's early trigger and the date (e.g. the 1971
    // chapter) still shows the caption, and the gong still rings on the date.
    for (const m of this.moments) {
      m.fired = m.at < index - 0.5;
      m.dated = m.fired;
    }
    this.hintShown = this.hintShown || index > this.hintIndex;
  }

  /** Solo one currency (or clear): the line, the map region and the voice together. */
  private toggleSolo(index: number): void {
    if (index < 0 || !this.ready) return;
    void this.audio.unlock();
    this.solo = this.solo === index ? -1 : index;
    this.audio.setSolo(this.solo);
    if (import.meta.env.DEV) console.info(`[ctm-solo] ${this.solo} at ${performance.now().toFixed(0)}`);
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
      // An open history card eases time almost to a stop (and back).
      const rateTarget = this.portals.showingDetails ? 0.12 : 1;
      this.clock.rate += (rateTarget - this.clock.rate) * Math.min(1, dt / 0.5);
      this.clock.advance(dt);
      this.fireMoments();
      if (this.clock.ended) this.enterToday();
    }
    const p = this.clock.position;
    const flowing = this.phase === 'playing' && !this.clock.paused;

    this.updateCaptions(dt);
    this.updateDecade(p, flowing);
    // Event emphasis fades on real time, and waits while paused.
    if (flowing) for (let i = 0; i < this.focus.length; i++) this.focus[i] = Math.max(0, this.focus[i] - dt / FOCUS_HOLD_S);

    this.heads.fill(p);
    if (this.phase === 'today' && this.today) this.applyToday();
    else this.applyPosition(p);

    const turb = this.phase === 'today' ? 0.15 : Timeline.sample(this.timeline.turbulence, p);
    const floatBlend = Math.min(1, Math.max(0, (p - this.floatStartIndex + 20) / 40));

    // One moment, three bands.
    this.chartFrame.solo = this.solo;
    this.chartFrame.turbulence = turb;
    this.chart.update(dt, this.chartFrame);
    for (let i = 0; i < SLOTS.length; i++) {
      this.pct[i] = this.chart.headPct(i);
      this.late[i] = this.chart.isLate(i);
    }
    this.mapFrame.date = this.isoAt(p);
    this.mapFrame.solo = this.solo;
    this.mapFrame.flowing = flowing;
    this.map.update(dt, this.mapFrame);
    this.updatePortals(dt, p, flowing);

    this.audio.update(this.voiceInputs, turb, floatBlend, flowing);
    this.ambience.update(dt, turb);

    // Keep each voice at its place: spread west to east like the map, at
    // eye level by the chart, rising a little with its line (10 Hz is plenty).
    this.audioPosTimer -= dt;
    if (this.audioPosTimer <= 0) {
      this.audioPosTimer = 0.1;
      const half = (VOICES.arcDeg * Math.PI) / 360;
      const rig = this.rig.object3D!;
      SLOTS.forEach((_, i) => {
        const a = -half + (2 * half * i) / (SLOTS.length - 1);
        this.v1.set(Math.sin(a) * VOICES.radius, VOICES.y + this.chart.headY(i) * VOICES.rise, -Math.cos(a) * VOICES.radius);
        rig.localToWorld(this.v1);
        this.audio.setVoicePosition(i, this.v1.x, this.v1.y, this.v1.z);
      });
    }
    this.updateChartHeader(dt, p);
    if (import.meta.env.DEV) this.logDiagnostics(dt, p);
  }

  /** ISO date at the playhead (today: the live rates' date). */
  private isoAt(p: number): string {
    if (this.phase === 'today' && this.today) return this.today.asOf;
    return this.timeline.dateAt(p).toISOString().slice(0, 10);
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
    const pcts = SLOTS.map((s, i) => `${s.slot}:${this.pct[i] === null ? '-' : this.pct[i]!.toFixed(1)}`).join(',');
    const line =
      `[ctm] phase=${this.phase} year=${year} paused=${this.clock.paused} audio=${this.audio.ctx.state} ` +
      `notes=${this.audio.noteCount} fps=${fps.toFixed(0)} solo=${this.solo} portal=${this.portals.debug} pct=${pcts} ` +
      `listener=(${l.positionX.value.toFixed(2)},${l.positionY.value.toFixed(2)},${l.positionZ.value.toFixed(2)})`;
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

  /** Per-slot numbers at week p -> chart, map and voice inputs. */
  private applyPosition(p: number): void {
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
    this.brightness[i] = 0.5 + 0.5 * Math.tanh(momentum * 6);
    this.codes[i] = code;
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
        // A warm marker pinned to the event's date on that currency's line;
        // it appears when time reaches the date and then flows away with the
        // history, so the moves that followed are drawn right after it.
        this.chart.markEvent(i, at);
      }
      if (e.tier === 'major') {
        // Portal events tint the sky when their window opens (same moment).
        if (!m.portal) this.ambience.markEvent();
        this.chart.boostAll();
      }
    }
    // The date of a major event: the gong rings and the currencies it
    // touched are highlighted again, as the real moves begin.
    for (const m of this.moments) {
      if (m.dated || p < m.at || m.event.tier !== 'major') continue;
      m.dated = true;
      this.audio.gong();
      this.chart.boostAll();
      for (const slot of m.event.focus) {
        const i = SLOTS.findIndex((s) => s.slot === slot);
        if (i >= 0) this.focus[i] = 1;
      }
    }
  }

  /** Open, animate and close the Historical Portals; the era view yields the band to them. */
  private updatePortals(dt: number, p: number, flowing: boolean): void {
    const playing = this.phase === 'playing';
    // While its card is open, the window waits for the user.
    const st = this.director.update(p, dt, playing && flowing && !this.portals.showingDetails);
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
      laneVisible: 0,
    });
    const date = this.phase === 'today' && this.today ? new Date(this.today.asOf + 'T00:00:00Z') : this.timeline.dateAt(p);
    this.era.update(p, date, eraAt(this.isoAt(p)), 1 - this.portals.visibility, this.phase === 'today');
    this.readoutTimer -= dt;
    if (this.readoutTimer <= 0) {
      this.readoutTimer = 0.25;
      this.updateReadout(p);
    }
  }

  /**
   * "What happened": for the window's currencies, the rate on the decision's
   * date and at the playhead (live). Before the date, only the current rate.
   */
  private updateReadout(p: number): void {
    const i = this.portals.displayedIndex;
    const c = this.portals.contentOf(i);
    if (!c) return;
    const at = this.timeline.indexOf(c.date);
    const lines: string[] = [];
    for (const slot of c.currencies.slice(0, 2)) {
      const k = SLOTS.findIndex((m) => m.slot === slot);
      if (k < 0) continue;
      const s = this.timeline.slots[k];
      if (p < s.first || at < s.first) continue;
      const rateAt = (idx: number) => s.firstRate / Math.exp(Timeline.sample(s.strength, idx));
      const word = CURRENCY_WORDS[this.timeline.codeAt(k, p)] ?? slot;
      // "On the date" is the last weekly observation on or before it: the
      // decision day itself may fall between observations (even on a Sunday),
      // and no rate is invented for it.
      lines.push(readoutLine(word, rateAt(Math.floor(at + 1e-9)), rateAt(p), p >= at));
    }
    this.portals.setReadout(lines);
  }

  // -------------------------------------------------------------------------
  // Captions & time
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

  /** Captions live in the Historical Events band (the era view shows them). */
  private showCaption(c: Caption | null): void {
    this.era.setCaption(c);
  }

  /** A soft chime at each new decade while time flows. */
  private updateDecade(p: number, flowing: boolean): void {
    if (this.phase === 'today') return;
    const decade = Math.floor(this.timeline.dateAt(p).getUTCFullYear() / 10);
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
    if (mixed) text = `Each line ends at its latest rate; some are from ${formatShort(earliest)}. Pinch a currency for details.`;
    else if (bundled) text = 'Live rates are unavailable right now. Pinch a currency to hear its latest move.';
    else text = 'This is the world of money right now. Pinch a currency to hear how it moved since yesterday.';
    return { label, text };
  }

  /** Map today's live rates onto the lines (each ends at its own latest date). */
  private applyToday(): void {
    const today = this.today!;
    const last = this.timeline.count - 1;
    if (!this.todayApplied) this.chart.beginMorph(); // glide from the last week to today
    this.timeline.slots.forEach((s, i) => {
      const r = this.todayRate(i, today);
      if (!r) return;
      const strength = Math.log(s.firstRate / r.rate);
      const daily = Math.log(r.prev / r.rate);
      this.fill(i, true, strength, daily * 40, 0, r.code);
      // The line ends at this currency's own latest date (not a shared
      // "today"), joined to the weekly history by a straight line between
      // two real observations.
      const at = Math.max(last, this.timeline.indexOf(r.date));
      this.heads[i] = at;
      this.tails[i] = { index: at, value: strength };
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

  /** Each currency speaks once, west to east: a rising or falling grace note
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
  // Chart header: the date, and the soloed currency's numbers
  // -------------------------------------------------------------------------

  private updateChartHeader(dt: number, p: number): void {
    // The date: every frame, but the string is rebuilt only when the month changes.
    const isToday = this.phase === 'today' && !!this.today;
    const d = isToday ? new Date(this.today!.asOf + 'T00:00:00Z') : this.timeline.dateAt(p);
    const monthKey = isToday ? -1 : d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (monthKey !== this.monthKey || isToday) {
      this.monthKey = monthKey;
      this.chart.setDate(isToday ? `Today · ${formatShort(this.today!.asOf)} ${d.getUTCFullYear()}` : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`);
    }
    this.infoTimer -= dt;
    if (this.infoTimer > 0) return;
    this.infoTimer = 0.25;
    const base = BASE_CURRENCY.code;
    const months = Math.round((CHART.windowWeeks * 7) / 30.44);
    let text = `Change in value vs ${base} over the last ${months} months · one scale for all · up = stronger than the dollar`;
    const i = this.solo;
    if (i >= 0) {
      const s = this.timeline.slots[i];
      const meta = SLOTS[i];
      const code = this.codes[i];
      const title = `${code} ${meta.names[code] ?? code}`;
      const b = this.chart.baseOf(i);
      if (this.phase === 'today' && this.today) {
        const r = this.todayRate(i, this.today);
        const day = r ? (r.prev / r.rate - 1) * 100 : 0;
        text = r
          ? `${title}: ${b ? `${signed(b.headPct, 1)}% in ${months} months, ` : ''}${formatShort(r.prevDate)} to ${formatShort(r.date)}: ${signed(day, 2)}% vs ${base}`
          : title;
      } else if (p < s.first) {
        text = `${title}: data begins in ${this.firstYear[i]}`;
      } else {
        const total = (Math.exp(Timeline.sample(s.strength, p)) - 1) * 100;
        const since = this.firstYear[i];
        const span = b?.late ? `since its data begins (${since})` : `in ${months} months`;
        text = `${title}: ${b ? `${signed(b.headPct, 1)}% vs ${base} ${span}` : ''} · since ${since}: ${signed(total, 0)}%  (pinch again to hear all)`;
      }
    }
    this.chart.setHeader(text);
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
  return x >= 0 ? `+${s}` : `−${s}`;
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
