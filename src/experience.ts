/**
 * ExperienceSystem: the conductor. Each frame it advances the one playback
 * clock and feeds the same moment to all three bands, the guide robot and
 * the sound:
 *
 *   events band  (top)     Year Journey: year selector, then the year stage
 *                          (world, leaders, events, summary) and the guide's
 *                          subtitles. Full Journey: the era view and the
 *                          Historical Portals around major moments.
 *   chart band   (middle)  nine lines of change vs USD on one shared scale
 *                          (Year Journey: January to December of one year)
 *   map band     (bottom)  where each currency lives, with the same numbers
 *
 * Two journeys:
 *   Year Journey (default)  intro -> select -> warp -> review -> summary
 *   Full Journey            playing -> today (1948 to now, as before)
 *
 * Phases:
 *   idle      waiting for XR entry (or the "watch in browser" click)
 *   intro     the guide introduces itself (10-15 s, skippable)
 *   select    choose a year; its verified events are previewed
 *   warp      the time tunnel (2-3 s, skippable; the user never moves)
 *   review    the year plays, stopping at the guide's beats
 *   summary   the year in one view; where to go next
 *   playing   the Full Journey time-lapse (can be paused)
 *   today     the Full Journey reached the present; live rates are shown
 *
 * Selection (solo) and emphasis are one shared state: pinching a currency
 * on the map or the chart highlights its line, its region and its voice
 * together. In a Year Journey, pinching a map marker opens that place's
 * leaders and currency (the guide pauses), pinching it again goes on.
 */
import {
  AudioListener,
  createSystem,
  Group,
  Hovered,
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
import { Orb, PortalTarget, UiTarget } from './components.js';
import {
  BANDS,
  bandPitch,
  BASE_CURRENCY,
  CAPTION_STRIP,
  CHART,
  HAND_PANEL,
  ROBOT_SPOTS,
  SHOW_PEOPLE,
  SLOTS,
  VOICES,
  YEAR_JOURNEY,
  type Band,
} from './config.js';
import { annualChanges, formatRate, rateAt, ranking, shortDate, signedPct, yearSpan, yearWindow, type YearWindow } from './data/annual-currency.js';
import {
  eventDateText,
  eventsInYear,
  featuredRegions,
  isDated,
  leadersInYear,
  REGIONS,
  regionName,
  regionOfMarker,
  regionsOfSlot,
  termText,
  type AnnualEvent,
  type LeadersFile,
  type RegionId,
} from './data/annual-history.js';
import { eraAt } from './data/eras.js';
import { CHAPTERS, EVENTS, FLOAT_START, HINT_TEXT, type HistoryEvent } from './data/events.js';
import { PORTAL_SCENES } from './data/portals.js';
import { CURRENCY_WORDS, readoutLine, type HistoryContent } from './data/history-content.js';
import { Timeline } from './data/timeline.js';
import { loadToday, type TodayData } from './data/today.js';
import type { WorldMapFile } from './data/world-map.js';
import { buildYearScript, leaderSentence, lineSeconds, STORIES, STRINGS, summaryLine, type Beat, type Mood, type YearContext } from './guide/guide-scripts.js';
import { DEFAULT_PACING, PlaybackClock, slowDownsFor } from './playback/clock.js';
import { PortalDirector } from './playback/portal-director.js';
import { YearRunner } from './playback/year-journey.js';
import { Ambience } from './visual/ambience.js';
import { EraPanel } from './visual/era-panel.js';
import { GuideRobot } from './visual/guide-robot.js';
import { HistoricalPortals } from './visual/historical-portals.js';
import { MultiCurrencyChart, type ChartFrame } from './visual/multi-currency-chart.js';
import { TimeMachineTunnel } from './visual/time-machine-tunnel.js';
import type { TrailTail } from './visual/trail-sampling.js';
import { CanvasButton, UiAction } from './visual/ui-button.js';
import { CaptionStrip, DECADES, QUICK_YEARS, YearSelector, type YearPreview } from './visual/year-selector.js';
import { YearStage, type StageOffice, type StageView } from './visual/year-stage.js';
import { WorldCurrencyMap, type MapFrame } from './visual/world-currency-map.js';

type Phase = 'idle' | 'intro' | 'select' | 'warp' | 'review' | 'summary' | 'playing' | 'today';
export type JourneyMode = 'year' | 'full';

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

/** One year being visited. */
interface YearVisit {
  year: number;
  window: YearWindow;
  ctx: YearContext;
  runner: YearRunner<Beat>;
  events: AnnualEvent[];
}

/** Weeks before a major event at which its caption (and portal) appear. */
const MAJOR_LEAD = 16;
const MINOR_LEAD = 3;

/** Shortest a caption stays when another is waiting, and its natural length. */
const CAPTION_TIMES = { major: [4.5, 7.5], minor: [3.5, 6], hint: [5, 7] } as const;
const FOCUS_HOLD_S = 5;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Orb slot index used by the US dollar's map marker (not a line). */
const USD_SLOT = SLOTS.length;

export class ExperienceSystem extends createSystem({
  pressedOrbs: { required: [Orb, Pressed] },
  pressedPortal: { required: [PortalTarget, Pressed] },
  pressedUi: { required: [UiTarget, Pressed] },
  hoveredUi: { required: [UiTarget, Hovered] },
}) {
  private ready = false;
  private phase: Phase = 'idle';
  private mode: JourneyMode = 'year';
  private timeline!: Timeline;
  private clock!: PlaybackClock;
  private audio!: SoundEngine;
  private narration = new Narration();
  private today: TodayData | null = null;
  private todayPromise: Promise<TodayData | null> | null = null;
  private content: HistoryContent | null = null;
  private leaders: LeadersFile | null = null;
  private annualEvents: AnnualEvent[] = [];
  private baseUrl = '/';

  private rig!: Entity;
  private chart!: MultiCurrencyChart;
  private map!: WorldCurrencyMap;
  private era!: EraPanel;
  private portals!: HistoricalPortals;
  private director!: PortalDirector;
  private ambience!: Ambience;
  private handPanel!: UIKitMLAsset;
  private chartBand!: Group;
  private mapBand!: Group;
  private bands: Group[] = [];
  private robot!: GuideRobot;
  private tunnel!: TimeMachineTunnel;
  private selector!: YearSelector;
  private stage!: YearStage;
  private captions!: CaptionStrip;
  private skipIntro!: CanvasButton;
  private readonly buttonsByObject = new Map<Object3D, CanvasButton>();

  // Full Journey state.
  private moments: Moment[] = [];
  private fullEvents: { t: number; label: string }[] = [];
  private hintShown = false;
  private hintIndex = 0;
  private floatStartIndex = 0;
  private captionQueue: Caption[] = [];
  private caption: Caption | null = null;
  private captionAge = 0;
  private lastDecade = -1;

  // Year Journey state.
  private visit: YearVisit | null = null;
  private selectedYear = 1985;
  private span = { min: 1948, max: 2026 };
  private introDone = false;
  private introLines: string[] = [];
  private introAge = 0;
  private guideLine: string | null = null;
  private guideAge = 0;
  private spot: number[] | null = null;
  private allCurrencies = false;
  private usdFocus = 0;
  private calm = false;
  private warpTarget = 0;
  private warpRevealed = false;
  /** A place opened by pinching its marker (the year waits), or null. */
  private explore: { region: RegionId; slot: number } | null = null;
  private stageRegion: RegionId | null = null;
  private stageTimer = 0;
  private portalShow = { index: -1, appear: 0, out: 0, open: false };
  private rateEase = 1;
  private summaryAge = -1;

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
  private readonly spotBuf: number[] = SLOTS.map(() => 0);
  private firstYear: number[] = [];
  private readonly chartFrame: ChartFrame = {
    heads: this.heads,
    tails: this.tails,
    focus: this.focus,
    brightness: this.brightness,
    solo: -1,
    codes: this.codes,
    turbulence: 0,
    year: null,
    spot: null,
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
    spot: null,
    usd: 0,
  };
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly q1 = new Quaternion();
  private readonly q2 = new Quaternion();
  private listener: Object3D | null = null;

  init(): void {
    this.cleanupFuncs.push(
      this.queries.pressedOrbs.subscribe('qualify', (entity) => {
        this.onCurrencyPinch(entity.getValue(Orb, 'slotIndex') ?? -1);
      }),
      this.queries.pressedPortal.subscribe('qualify', () => {
        void this.audio?.unlock();
        this.portals?.toggleDetails();
      }),
      this.queries.pressedUi.subscribe('qualify', (entity) => {
        const b = entity.object3D ? this.buttonsByObject.get(entity.object3D) : undefined;
        if (b && b.isActive) this.onUi(entity.getValue(UiTarget, 'action') ?? 0);
      }),
      this.queries.hoveredUi.subscribe('qualify', (entity) => {
        if (entity.object3D) this.buttonsByObject.get(entity.object3D)?.setHover(true);
      }),
      this.queries.hoveredUi.subscribe('disqualify', (entity) => {
        if (entity.object3D) this.buttonsByObject.get(entity.object3D)?.setHover(false);
      }),
      this.world.visibilityState.subscribe((state) => this.onVisibility(state)),
    );
    const onHidden = () => {
      if (document.hidden) this.autoPause();
      else this.autoResume();
    };
    document.addEventListener('visibilitychange', onHidden);
    this.cleanupFuncs.push(() => document.removeEventListener('visibilitychange', onHidden));
    this.keyboard();
  }

  /**
   * Keyboard (PC browser): [ and ] change the year by one, - and = by ten,
   * Enter starts the travel (or goes to the next year), Escape skips, Space
   * pauses. Dev builds add shortcuts for automation and demo clips:
   *   1-5 chapters   g h j k l b n m , solo CAD..AUD   p pause   y Year Journey
   *   6 before the Asian crisis   7 before the 2022 yen slide   0 before the 1985 moment
   *   8 near the end   9 Full Journey   c no frame-time cap   v portal card
   * (W/A/S/D and the arrows are left alone: the emulator moves the head with them.)
   */
  private keyboard(): void {
    const soloKeys = 'ghjklbnm,';
    const onKey = (e: KeyboardEvent) => {
      if (!this.ready || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === '[') this.changeYear(-1);
      else if (k === ']') this.changeYear(1);
      else if (k === '-') this.changeYear(-10);
      else if (k === '=') this.changeYear(10);
      else if (k === 'enter') this.onUi(this.phase === 'summary' ? UiAction.NextYear : UiAction.StartTravel);
      else if (k === 'escape') this.skip();
      else if (k === ' ') this.togglePause();
      if (!import.meta.env.DEV) return;
      if (k >= '1' && k <= '5') this.jumpTo(this.timeline.indexOf(CHAPTERS[Number(k) - 1].date));
      else if (soloKeys.includes(k)) this.onCurrencyPinch(soloKeys.indexOf(k));
      else if (k === 'p') this.togglePause();
      else if (k === 'c') this.devRealtime = !this.devRealtime;
      else if (k === 'v') this.portals.toggleDetails();
      else if (k === 'y') this.enterSelect();
      else if (k === 'u') this.onCurrencyPinch(USD_SLOT);
      else if (k === '8') this.jumpTo(this.timeline.count - 40);
      else if (k === '9') this.startFull();
      else if (k === '6') this.jumpTo(this.timeline.indexOf('1997-08-01'));
      else if (k === '7') this.jumpTo(this.timeline.indexOf('2022-01-07'));
      else if (k === '0') this.jumpTo(this.timeline.indexOf('1985-04-26'));
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));
  }

  /** Builds the world once data and panels are available. Called from index.ts. */
  async setup(
    timeline: Timeline,
    content: HistoryContent | null = null,
    worldMap: WorldMapFile | null = null,
    annual: { leaders: LeadersFile | null; events: AnnualEvent[] } = { leaders: null, events: [] },
    baseUrl = '/',
  ): Promise<void> {
    this.timeline = timeline;
    this.content = content;
    this.leaders = annual.leaders;
    this.annualEvents = annual.events;
    this.baseUrl = baseUrl;
    this.span = yearSpan(timeline);
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
    this.narration.onSpeaking = (on) => this.audio.duck(on);
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
    this.fullEvents = EVENTS.map((e) => ({ t: timeline.indexOf(actualDay(e)), label: e.short }));
    this.chart = new MultiCurrencyChart(
      timeline.slots,
      SLOTS.map((s) => s.color),
      this.fullEvents,
      (year) => timeline.indexOf(`${year}-01-01`),
      (index) => timeline.dateAt(index).getUTCFullYear(),
    );
    this.chartBand.add(this.chart.root);
    const chartEntity = this.world.createTransformEntity(this.chartBand, { parent: this.rig });
    this.chart.hits.forEach((hit, i) => this.pinchTarget(hit, i, chartEntity));

    // Bottom band: the Interactive World Currency Map.
    this.mapBand = this.band(BANDS.map);
    this.map = new WorldCurrencyMap(
      SLOTS.map((s) => s.slot),
      SLOTS.map((s) => s.color),
    );
    if (worldMap) this.map.setLand(worldMap);
    this.mapBand.add(this.map.root);
    const mapEntity = this.world.createTransformEntity(this.mapBand, { parent: this.rig });
    this.map.hits.forEach((hit, i) => hit && this.pinchTarget(hit, i, mapEntity));
    if (this.map.usdHit) this.pinchTarget(this.map.usdHit, USD_SLOT, mapEntity);

    // Top band: Historical Events (Full Journey) and the Year Journey's panels.
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
    // Contest-safe build: the portals show places and policies, no people.
    const portalContent = SHOW_PEOPLE || !content ? content : new Map([...content].map(([k, v]) => [k, { ...v, people: [] }]));
    this.portals = new HistoricalPortals(PORTAL_SCENES, portalContent, (t) => this.world.renderer.initTexture(t), slotCss);
    eventsBand.add(this.portals.root);
    this.selector = new YearSelector();
    this.stage = new YearStage();
    this.captions = new CaptionStrip(CAPTION_STRIP.width, CAPTION_STRIP.height);
    this.captions.root.position.set(0, CAPTION_STRIP.y, 0.012);
    this.skipIntro = new CanvasButton(0.16, 0.055, UiAction.SkipIntro, 'Skip intro', 'ghost');
    this.skipIntro.mesh.position.set(0.72, -0.12, 0.014);
    this.skipIntro.setShown(false);
    eventsBand.add(this.selector.root, this.stage.root, this.captions.root, this.skipIntro.mesh);
    const eventsEntity = this.world.createTransformEntity(eventsBand, { parent: this.rig });
    const portalHit = this.world.createTransformEntity(this.portals.hit, { parent: eventsEntity });
    portalHit.addComponent(PortalTarget);
    portalHit.addComponent(RayInteractable); // 1.4 m away: pinch from afar
    for (const b of [...this.selector.buttons, ...this.stage.buttons, this.skipIntro]) this.uiTarget(b, eventsEntity);
    this.bands = [eventsBand, this.chartBand, this.mapBand];

    // The guide robot and the time tunnel.
    this.robot = new GuideRobot();
    this.world.createTransformEntity(this.robot.root, { parent: this.rig });
    this.world.createTransformEntity(this.robot.beamLine, { parent: this.rig });
    this.robot.moveTo(...ROBOT_SPOTS.front, true);
    this.robot.setVisible(false);
    this.tunnel = new TimeMachineTunnel();
    this.world.createTransformEntity(this.tunnel.root, { parent: this.rig });

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
    this.calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.selectedYear = Math.min(this.span.max, Math.max(this.span.min, 1985));
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

  /** A Year Journey button: pinch from afar or touch. */
  private uiTarget(b: CanvasButton, parent: Entity): void {
    const e = this.world.createTransformEntity(b.mesh, { parent });
    e.addComponent(UiTarget, { action: b.action });
    e.addComponent(RayInteractable);
    e.addComponent(PokeInteractable);
    this.buttonsByObject.set(b.mesh, b);
  }

  // -------------------------------------------------------------------------
  // Lifecycle & input
  // -------------------------------------------------------------------------

  /** Options from the start screen (inside its click: allowed to start audio and speech). */
  configure(opts: { mode?: JourneyMode; voice?: boolean; calm?: boolean }): void {
    if (opts.mode) this.mode = opts.mode;
    if (opts.voice !== undefined) this.narration.enabled = opts.voice && this.narration.available;
    if (opts.calm !== undefined) this.calm = opts.calm || this.calm;
    if (this.ready) this.updatePanel();
  }

  /** Start the chosen journey (from XR entry, a click, or Replay). */
  start(): void {
    if (!this.ready) return;
    if (this.mode === 'full') this.startFull();
    else if (!this.introDone) this.enterIntro();
    else this.enterSelect();
  }

  /** Start the Full Journey from 1948. */
  startFull(): void {
    if (!this.ready) return;
    this.mode = 'full';
    this.leaveYearJourney();
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
    this.robot.setVisible(true);
    this.robot.moveTo(...ROBOT_SPOTS.side);
    this.robot.mood = 'idle';
    this.enqueue({ label: '', text: STRINGS.full, minS: 4, maxS: 6.5, hint: true });
    this.updatePanel();
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

  private get pausable(): boolean {
    return this.phase === 'playing' || this.phase === 'review';
  }

  private autoPause(): void {
    if (this.pausable && !this.clock.paused) {
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

  private togglePause(): void {
    if (this.pausable) this.setPaused(!this.clock.paused);
    else if (this.phase === 'today' || this.phase === 'idle') this.start();
  }

  private setPaused(paused: boolean): void {
    this.clock.paused = paused;
    this.audio.setPaused(paused);
    if (paused) this.narration.stop();
    // Resuming in a year: say the current line again (speech cannot resume midway).
    else if (this.phase === 'review' && this.guideLine) this.narration.speak(this.guideLine);
    this.updatePanel();
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
    on('btn-pause', () => this.togglePause());
    on('btn-voice', () => {
      this.narration.enabled = !this.narration.enabled && this.narration.available;
      if (!this.narration.enabled) this.narration.stop();
      else if (this.mode === 'year' && this.guideLine) this.narration.speak(this.guideLine);
      else if (this.caption) this.narration.speak(`${this.caption.label}. ${this.caption.text}`);
      this.updatePanel();
    });
    if (!this.narration.available) this.handPanel.requireElementById('btn-voice').setProperties({ display: 'none' });
    on('btn-skip', () => this.skip());
    on('btn-minus10', () => this.changeYear(-10));
    on('btn-minus1', () => this.changeYear(-1));
    on('btn-plus1', () => this.changeYear(1));
    on('btn-plus10', () => this.changeYear(10));
    on('btn-travel', () => this.onUi(this.phase === 'summary' ? UiAction.NextYear : this.phase === 'review' ? UiAction.Replay : UiAction.StartTravel));
    on('btn-years', () => this.enterSelect());
    on('btn-years2', () => this.enterSelect());
    on('btn-all', () => this.onUi(UiAction.AllCurrencies));
    on('btn-full', () => this.startFull());
    on('btn-calm', () => this.onUi(UiAction.Calm));
    CHAPTERS.forEach((ch, i) => on(`ch-${i}`, () => this.jumpTo(this.timeline.indexOf(ch.date))));
  }

  /** The hand panel shows the rows that belong to the current journey and phase. */
  private updatePanel(): void {
    if (!this.handPanel) return;
    const p = this.handPanel;
    const year = this.mode === 'year' && this.phase !== 'playing' && this.phase !== 'today';
    const set = (id: string, props: Record<string, unknown>) => p.requireElementById(id).setProperties(props);
    set('row-dial', { display: year ? 'flex' : 'none' });
    set('row-year', { display: year ? 'flex' : 'none' });
    set('row-chapters', { display: year ? 'none' : 'flex' });
    set('label-year', { text: String(this.visit && this.phase !== 'select' ? this.visit.year : this.selectedYear) });
    set('label-travel', { text: this.phase === 'summary' ? 'Next year' : this.phase === 'review' ? 'Replay' : 'Start Travel' });
    set('label-all', { text: this.allCurrencies ? 'All: on' : 'All' });
    set('label-full', { text: this.mode === 'full' ? 'Restart Full' : 'Full Journey' });
    set('label-calm', { text: `Calm: ${this.calm ? 'on' : 'off'}` });
    set('label-voice', { text: this.narration.enabled ? 'Voice on' : 'Voice' });
    const pausable = this.pausable;
    const showPlay = pausable ? this.clock.paused : this.phase === 'today' || this.phase === 'idle';
    const label = this.phase === 'today' ? 'Replay' : this.phase === 'idle' ? 'Start' : !pausable ? 'Pause' : this.clock.paused ? 'Play' : 'Pause';
    set('label-pause', { text: label });
    set('icon-pause', { display: showPlay ? 'none' : 'flex' });
    set('icon-play', { display: showPlay ? 'flex' : 'none' });
    this.selector?.setCalm(this.calm);
  }

  /** Buttons on the 3D panels (and the keyboard, and the hand panel's twins). */
  private onUi(action: number): void {
    if (!this.ready) return;
    void this.audio.unlock();
    this.audio.blip(true);
    if (action === UiAction.StartTravel) {
      if (this.phase === 'select' || this.phase === 'intro' || this.phase === 'idle') this.travel(this.selectedYear);
    } else if (action === UiAction.YearMinus1) this.changeYear(-1);
    else if (action === UiAction.YearPlus1) this.changeYear(1);
    else if (action === UiAction.YearMinus10) this.changeYear(-10);
    else if (action === UiAction.YearPlus10) this.changeYear(10);
    else if (action >= UiAction.QuickYear && action < UiAction.QuickYear + QUICK_YEARS.length) this.setYear(QUICK_YEARS[action - UiAction.QuickYear].year);
    else if (action >= UiAction.Decade && action < UiAction.Decade + DECADES.length) this.setYear(DECADES[action - UiAction.Decade]);
    else if (action === UiAction.FullJourney) this.startFull();
    else if (action === UiAction.AnotherYear) this.enterSelect();
    else if (action === UiAction.PrevYear && this.visit && this.visit.year > this.span.min) this.travel(this.visit.year - 1);
    else if (action === UiAction.NextYear && this.visit && this.visit.year < this.span.max) this.travel(this.visit.year + 1);
    else if (action === UiAction.Replay && this.visit) this.travel(this.visit.year);
    else if (action === UiAction.SkipIntro) this.skip();
    else if (action === UiAction.Calm) {
      this.calm = !this.calm;
      this.updatePanel();
    } else if (action === UiAction.AllCurrencies) {
      this.allCurrencies = !this.allCurrencies;
      this.updatePanel();
    }
  }

  /** Skip: the intro, the warp, or the guide's current line. */
  private skip(): void {
    if (this.phase === 'intro') this.enterSelect();
    else if (this.phase === 'warp') this.tunnel.finish();
    else if (this.phase === 'review' && this.visit) {
      if (this.explore) this.endExplore();
      else {
        this.narration.stop();
        this.visit.runner.skip();
      }
    }
  }

  private jumpTo(index: number): void {
    if (this.mode !== 'full' || (this.phase !== 'playing' && this.phase !== 'today')) this.startFull();
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
    this.updatePanel();
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

  /** A currency was pinched (map marker or chart label; USD_SLOT = the dollar's marker). */
  private onCurrencyPinch(index: number): void {
    if (index < 0 || !this.ready) return;
    const yearPhase = this.mode === 'year' && (this.phase === 'review' || this.phase === 'summary');
    if (!yearPhase) {
      if (index < SLOTS.length) this.toggleSolo(index);
      return;
    }
    // Year Journey: open that place (its leaders and currency); pinch again to go on.
    const iso = this.isoAt(this.clock.position);
    const region = index === USD_SLOT ? 'USA' : regionOfMarker(SLOTS[index].slot, iso);
    if (!region) return;
    if (this.explore && this.explore.slot === index) {
      this.endExplore();
      return;
    }
    this.narration.stop();
    this.explore = { region, slot: index };
    if (index < SLOTS.length && this.solo !== index) this.toggleSolo(index);
    else if (index === USD_SLOT && this.solo >= 0) this.toggleSolo(this.solo);
    if (this.visit) {
      this.showRegion(region);
      this.say(`${leaderSentence(this.visit.ctx, region)} Pinch it again to go on.`, 'pointing');
      this.pointAtMarker(index === USD_SLOT ? 'USD' : SLOTS[index].slot);
    }
    this.updatePanel();
  }

  private endExplore(): void {
    if (!this.explore) return;
    this.explore = null;
    if (this.solo >= 0) this.toggleSolo(this.solo);
    this.narration.stop();
    if (this.phase === 'summary') this.showSummary();
    else if (this.visit) {
      // The interrupted beat is over; the year flows on to the next one.
      this.visit.runner.skip();
      this.say(null);
    }
  }

  /** Solo one currency (or clear): the line, the map region and the voice together. */
  private toggleSolo(index: number): void {
    if (index < 0 || index >= SLOTS.length || !this.ready) return;
    void this.audio.unlock();
    this.solo = this.solo === index ? -1 : index;
    this.audio.setSolo(this.solo);
    if (import.meta.env.DEV) console.info(`[ctm-solo] ${this.solo} at ${performance.now().toFixed(0)}`);
    this.infoTimer = 0;
  }

  // -------------------------------------------------------------------------
  // Year Journey: phases
  // -------------------------------------------------------------------------

  private enterIntro(): void {
    this.mode = 'year';
    this.phase = 'intro';
    void this.audio.unlock().then(() => this.audio.setPaused(false));
    this.introLines = [...STRINGS.intro];
    this.introAge = 0;
    this.guideLine = null;
    this.robot.setVisible(true);
    this.robot.moveTo(...ROBOT_SPOTS.front);
    this.robot.mood = 'excited';
    this.skipIntro.setShown(true);
    this.showYearPreview();
    this.selector.setShown(false);
    this.nextIntroLine();
    this.updatePanel();
  }

  private nextIntroLine(): void {
    const line = this.introLines.shift();
    if (!line) {
      this.introDone = true;
      this.enterSelect();
      return;
    }
    this.introAge = 0;
    this.say(line, this.introLines.length === STRINGS.intro.length - 1 ? 'excited' : 'talking');
  }

  /** Choose a year (from the intro, the summary, the Full Journey, or the Years button). */
  private enterSelect(): void {
    if (!this.ready) return;
    const wasFull = this.mode === 'full' || this.phase === 'playing' || this.phase === 'today';
    this.mode = 'year';
    this.introDone = true;
    this.phase = 'select';
    this.explore = null;
    if (this.solo >= 0) this.toggleSolo(this.solo);
    void this.audio.unlock().then(() => this.audio.setPaused(false));
    if (wasFull) {
      this.captionQueue.length = 0;
      this.caption = null;
      this.showCaption(null);
      this.portals.hideDetails();
    }
    this.closePortal(true);
    this.skipIntro.setShown(false);
    this.stage.setShown(false);
    this.selector.setShown(true);
    this.robot.setVisible(true);
    this.robot.moveTo(...ROBOT_SPOTS.front);
    this.robot.mood = 'thinking';
    this.robot.point(null);
    if (this.visit) this.selectedYear = this.visit.year;
    this.visit = null;
    this.clock.paused = false;
    this.showYearPreview();
    this.say(STRINGS.select, 'thinking');
    this.updatePanel();
  }

  private changeYear(delta: number): void {
    if (this.mode !== 'year' || (this.phase !== 'select' && this.phase !== 'intro' && this.phase !== 'summary')) {
      if (this.phase !== 'review') return;
    }
    const base = this.phase === 'summary' && this.visit ? this.visit.year : this.selectedYear;
    if (this.phase !== 'select') this.enterSelect();
    this.setYear(base + delta);
  }

  private setYear(year: number): void {
    if (this.phase !== 'select') this.enterSelect();
    this.selectedYear = Math.min(this.span.max, Math.max(this.span.min, year));
    this.showYearPreview();
    this.audio.blip(true);
    this.updatePanel();
  }

  /** The selector's preview, the chart's empty year and the map's geography for the chosen year. */
  private showYearPreview(): void {
    const year = this.selectedYear;
    const w = yearWindow(this.timeline, year);
    if (!w) return;
    const last = this.isoOf(this.timeline.count - 1);
    const events = eventsInYear(this.annualEvents, year, last);
    const iso = this.isoOf(w.first);
    const notes: string[] = [];
    if (w.startsLate) notes.push(`Our data begins on ${shortDate(iso)}, ${year}`);
    if (w.ongoing) notes.push(`Year to date: data to ${shortDate(last)}, ${year}`);
    this.timeline.slots.forEach((s, i) => {
      if (s.first > w.first && s.first <= w.last) notes.push(`${SLOTS[i].slot === 'EUR' ? 'DEM' : SLOTS[i].slot} data begins ${shortDate(this.isoOf(s.first))}`);
      else if (s.first > w.last) notes.push(`${SLOTS[i].slot} from ${this.firstYear[i]}`);
    });
    const preview: YearPreview = {
      year,
      era: eraAt(`${year}-07-01`).name,
      events: events.map((e) => ({
        date: eventDateText(e),
        title: e.title,
        places: e.regions.map((r) => regionName(r, e.date)).join(', '),
        currencies: e.currencies.map((c) => this.codeOn(c, e.date)).join(', '),
        summary: e.summary,
      })),
      notes,
    };
    this.selector.setYear(preview, this.span.min, this.span.max);
    // The chart shows the chosen year's empty axis; the map, that year's world.
    this.chartFrame.year = { start: w.first, axis0: w.axisStart, axis1: w.axisEnd };
    this.clock.setWindow(w.first, w.last, YEAR_JOURNEY.weeksPerSecond);
    this.clock.stopAt = w.first;
  }

  /** Board the time machine for a year. */
  private travel(year: number): void {
    if (!this.ready) return;
    const target = Math.min(this.span.max, Math.max(this.span.min, year));
    const from = this.visit?.year ?? (this.phase === 'select' ? new Date().getUTCFullYear() : this.span.max);
    this.mode = 'year';
    this.phase = 'warp';
    this.explore = null;
    if (this.solo >= 0) this.toggleSolo(this.solo);
    this.narration.stop();
    this.closePortal(true);
    this.selector.setShown(false);
    this.stage.setShown(false);
    this.skipIntro.setShown(false);
    this.visit = null;
    this.selectedYear = target;
    this.warpTarget = target;
    this.warpRevealed = false;
    this.clock.paused = false;
    void this.audio.unlock().then(() => this.audio.setPaused(false));
    const seconds = this.calm ? YEAR_JOURNEY.calmWarpSeconds : YEAR_JOURNEY.warpSeconds;
    this.tunnel.start(from === target ? target + 1 : from, target, seconds, this.calm);
    this.audio.warp(seconds, this.calm);
    this.robot.moveTo(...ROBOT_SPOTS.warp);
    this.robot.mood = 'traveling';
    this.robot.point(null);
    this.say(STRINGS.warp(target), 'traveling');
    this.updatePanel();
  }

  /** Behind the veil: set the bands to the destination year and build the guide's script. */
  private arrive(year: number): void {
    const tl = this.timeline;
    const w = yearWindow(tl, year)!;
    const lastIso = this.isoOf(tl.count - 1);
    const midIso = this.isoOf(Math.round((w.first + w.last) / 2));
    const events = eventsInYear(this.annualEvents, year, lastIso);
    const changes = annualChanges(tl, tl.slots, year);
    const story = STORIES[year];
    const featured = story?.featured ?? featuredRegions(events, changes.filter((c) => c && c.comparable).map((c) => ({ slot: c!.slot, pct: c!.pct })), midIso);
    const ctx: YearContext = {
      year,
      window: w,
      indexOf: (iso) => tl.indexOf(iso),
      slots: tl.slots,
      changes,
      events,
      featured: featured.length ? featured : (['USA'] as RegionId[]),
      leaders: (r) => (this.leaders ? leadersInYear(this.leaders, r, year, lastIso) : []),
      regionName: (r) => regionName(r, midIso),
      regionSlot: (r) => REGIONS[r].slot,
      regionSystem: (r) => REGIONS[r].system,
      era: eraAt(midIso),
      showPeople: SHOW_PEOPLE,
      eventPeople: (id) => (this.content?.get(id)?.people ?? []).map((p) => p.name),
      lastDate: lastIso,
    };
    const beats = buildYearScript(ctx);
    this.visit = { year, window: w, ctx, runner: new YearRunner(beats, w.last), events };
    this.chartFrame.year = { start: w.first, axis0: w.axisStart, axis1: w.axisEnd };
    this.chart.setEvents(events.filter(isDated).map((e) => ({ t: tl.indexOf(e.date), label: shortTitle(e.title) })));
    this.chart.beginMorph();
    this.chart.reset();
    this.map.setYearMode(true);
    this.clock.setWindow(w.first, w.last, YEAR_JOURNEY.weeksPerSecond);
    this.clock.stopAt = w.first;
    this.rateEase = 0;
    this.focus.fill(0);
    this.spot = null;
    this.summaryAge = -1;
    this.stageRegion = null;
    this.monthKey = -2;
    this.stage.setNav(year > this.span.min, year < this.span.max);
    this.stage.show(this.worldView());
  }

  private enterReview(): void {
    if (!this.visit) return;
    this.phase = 'review';
    this.stage.setShown(true);
    this.robot.moveTo(...ROBOT_SPOTS.side);
    this.robot.mood = 'excited';
    this.audio.shimmer();
    this.say(null);
    this.updatePanel();
  }

  private enterSummary(): void {
    const v = this.visit;
    if (!v) return;
    this.phase = 'summary';
    this.summaryAge = 0;
    this.explore = null;
    this.closePortal(false);
    this.showSummary();
    this.robot.mood = 'excited';
    this.robot.point(null);
    this.spot = null;
    this.say(summaryLine(v.ctx), 'talking');
    this.updatePanel();
  }

  private leaveYearJourney(): void {
    this.phase = 'playing';
    this.visit = null;
    this.explore = null;
    this.selector.setShown(false);
    this.stage.setShown(false);
    this.skipIntro.setShown(false);
    this.say(null);
    this.closePortal(true);
    this.chartFrame.year = null;
    this.spot = null;
    this.clock.clearWindow();
    this.chart.setEvents(this.fullEvents);
    this.map.setYearMode(false);
    this.robot.point(null);
  }

  /** The guide says a line (subtitles always; speech when the voice is on). */
  private say(text: string | null, mood?: Mood): void {
    this.guideLine = text;
    this.guideAge = 0;
    this.captions.set(text);
    if (mood) this.robot.mood = mood;
    if (text) {
      this.narration.speak(text);
      this.audio.blip(true);
    }
  }

  // -------------------------------------------------------------------------
  // Year Journey: the stage's views
  // -------------------------------------------------------------------------

  private worldView(): StageView {
    const v = this.visit!;
    const iso = this.isoOf(Math.round((v.window.first + v.window.last) / 2));
    const era = eraAt(iso);
    return {
      kind: 'world',
      year: v.year,
      era: era.name,
      eraText: era.text,
      places: v.ctx.featured.map((r) => {
        const slot = REGIONS[r].slot;
        const k = SLOTS.findIndex((s) => s.slot === slot);
        return { name: regionName(r, iso), code: this.codeOn(slot, iso), color: k >= 0 ? css(SLOTS[k].color) : '#fff1c8' };
      }),
      events: v.events.map((e) => ({ date: eventDateText(e), title: e.title })),
      note: `Exchange rates: weekly observations, ${shortDate(this.isoOf(v.window.first))} to ${shortDate(this.isoOf(v.window.last))}${v.window.ongoing ? ' (year to date)' : ''}. Events checked against their sources.`,
    };
  }

  private showRegion(region: RegionId): void {
    this.stageRegion = region;
    this.stageTimer = 0;
    this.stage.show(this.regionView(region));
  }

  private regionView(region: RegionId): StageView {
    const v = this.visit!;
    const lastIso = this.isoOf(this.timeline.count - 1);
    const offices: StageOffice[] = (this.leaders ? leadersInYear(this.leaders, region, v.year, lastIso) : []).map((o) => ({
      title: o.office.title,
      people: o.terms.map((t) => ({
        name: SHOW_PEOPLE ? t.name : null,
        title: o.office.title,
        term: termText(t, lastIso),
        portrait: SHOW_PEOPLE && t.portrait ? `${this.baseUrl}${t.portrait.src}` : null,
        credit: SHOW_PEOPLE && t.portrait ? `Photo: ${t.portrait.artist.slice(0, 60)} · ${t.portrait.license} · Wikimedia Commons` : null,
      })),
      gap: o.gaps.length ? `No verified record: ${o.gaps.map((g) => `${shortDate(g.from < `${v.year}-01-01` ? `${v.year}-01-01` : g.from)} to ${shortDate(g.to > `${v.year}-12-31` ? `${v.year}-12-31` : g.to)}`).join(', ')}` : null,
    }));
    const slot = REGIONS[region].slot;
    return {
      kind: 'region',
      year: v.year,
      name: regionName(region, this.isoAt(this.clock.position)),
      system: REGIONS[region].system,
      offices: offices.slice(0, 3),
      currency: slot === 'USD' ? { code: 'USD', color: '#fff1c8', lines: ['The US dollar is the base: every other currency is measured against it.'] } : this.currencyLines(slot),
      peopleHidden: !SHOW_PEOPLE,
    };
  }

  /** A currency's year so far: never beyond the playhead. */
  private currencyLines(slot: string): { code: string; color: string; lines: string[] } | null {
    const v = this.visit!;
    const i = SLOTS.findIndex((s) => s.slot === slot);
    if (i < 0) return null;
    const s = this.timeline.slots[i];
    const p = Math.min(v.window.last, Math.floor(this.clock.position + 1e-6));
    const color = css(SLOTS[i].color);
    if (s.first > p) {
      return { code: slot === 'EUR' ? 'DEM' : slot, color, lines: [s.first > v.window.last ? `Our data for this currency begins in ${this.firstYear[i]}.` : `Data begins ${shortDate(this.isoOf(s.first))}.`] };
    }
    const from = Math.max(v.window.first, s.first);
    const code = this.timeline.codeAt(i, p);
    const r0 = rateAt(s, from);
    const r1 = rateAt(s, p);
    const pct = (Math.exp(s.strength[p] - s.strength[from]) - 1) * 100;
    const ended = p >= v.window.last && this.phase === 'summary';
    return {
      code,
      color,
      lines: [
        `${shortDate(this.isoOf(from))}: ${formatRate(r0)} ${this.timeline.codeAt(i, from)} per USD`,
        `${ended ? shortDate(this.isoOf(p)) : `Now (${shortDate(this.isoOf(p))})`}: ${formatRate(r1)} ${code} per USD`,
        `${signedPct(pct)} vs USD ${ended ? 'over the year' : 'so far'} (${pct >= 0 ? 'stronger' : 'weaker'})`,
      ],
    };
  }

  private eventView(e: AnnualEvent): StageView {
    return {
      kind: 'event',
      year: this.visit!.year,
      date: `${eventDateText(e)}${e.precision === 'year' ? '' : `, ${e.date.slice(0, 4)}`}`,
      title: e.title,
      place: `${e.city}, ${e.country}`,
      summary: e.summary,
      currencies: e.currencies.map((c) => {
        const k = SLOTS.findIndex((s) => s.slot === c);
        return { code: this.codeOn(c, e.date), color: k >= 0 ? css(SLOTS[k].color) : '#fff1c8' };
      }),
      places: `Places: ${e.regions.map((r) => regionName(r, e.date)).join(', ')}`,
      // (Contest-safe build: some source articles are named after people, so only their count is shown.)
      sources: `${SHOW_PEOPLE ? e.sources.map((s) => `Wikipedia, "${s.title}"`).join('; ') : `${e.sources.length} Wikipedia article${e.sources.length > 1 ? 's' : ''}, checked for this date`}${e.precision && e.precision !== 'day' ? ` (the sources give the ${e.precision} only)` : ''}`,
    };
  }

  private showSummary(): void {
    const v = this.visit!;
    const changes = v.ctx.changes;
    const ranked = ranking(changes);
    const first = ranked[0];
    const lastIso = this.isoOf(this.timeline.count - 1);
    const people: string[] = [];
    if (SHOW_PEOPLE && this.leaders) {
      for (const r of v.ctx.featured) {
        for (const o of leadersInYear(this.leaders, r, v.year, lastIso).slice(0, 2)) {
          for (const t of o.terms.slice(0, 2)) people.push(`${t.name}, ${o.office.title}`);
        }
      }
    }
    this.stage.show({
      kind: 'summary',
      year: v.year,
      period: first ? `${shortDate(first.fromDate)} to ${shortDate(first.toDate)}${v.window.ongoing ? ' (year to date)' : ''}` : '',
      events: v.events.map((e) => ({ date: eventDateText(e), title: e.title })),
      places: v.ctx.featured.map((r) => regionName(r, `${v.year}-07-01`)),
      people: SHOW_PEOPLE ? people.slice(0, 6) : [STRINGS.peopleHidden],
      ranking: ranked.map((c) => ({ code: c.codeTo, color: css(SLOTS[c.index].color), pct: c.pct })),
      others: changes
        .filter((c) => c && c.late)
        .map((c) => `${c!.codeTo}: ${signedPct(c!.pct)} from ${shortDate(c!.fromDate)} (data begins; not ranked)`),
    });
    this.stage.setShown(true);
  }

  /** What a beat shows: the stage view, the spotlight, the robot's gesture. */
  private onBeat(b: Beat): void {
    const v = this.visit!;
    const timesSay = b.text;
    this.say(timesSay, b.mood);
    // Spotlight: the beat's currencies (the rest dim), unless All Currencies is on.
    this.spotBuf.fill(0);
    let any = false;
    for (const slot of b.focus) {
      const i = SLOTS.findIndex((s) => s.slot === slot);
      if (i >= 0) {
        this.spotBuf[i] = 1;
        this.focus[i] = 1;
        any = true;
      }
    }
    this.spot = any ? this.spotBuf : null;
    this.usdFocus = b.point === 'USD' || b.region === 'USA' ? 1 : 0;
    if (b.point) this.pointAtMarker(b.point);
    else this.robot.point(null);
    if (b.part === 'world') this.stage.show(this.worldView());
    else if (b.part === 'leaders' && b.region) this.showRegion(b.region);
    else if (b.part === 'event' && b.eventId) {
      const e = v.events.find((x) => x.id === b.eventId);
      const scene = PORTAL_SCENES.findIndex((sc) => sc.eventId === b.eventId);
      if (scene >= 0) this.openPortal(scene);
      else if (e) {
        this.stageRegion = null;
        this.stage.show(this.eventView(e));
      }
      // The moment itself: a gong, a warm marker on the lines it touched.
      this.audio.gong();
      this.ambience.markEvent(scene >= 0 ? PORTAL_SCENES[scene].tint : undefined);
      this.chart.boostAll();
      if (e) for (const c of e.currencies) {
        const i = SLOTS.findIndex((s) => s.slot === c);
        if (i >= 0) this.chart.markEvent(i, this.timeline.indexOf(e.date));
      }
    } else if (b.part === 'currency' && b.point && b.point !== 'USD') {
      const r = regionsOfSlot(b.point, this.isoAt(this.clock.position))[0];
      if (r) this.showRegion(r);
    }
    if (b.part !== 'event') this.closePortal(false);
  }

  private pointAtMarker(id: string): void {
    this.map.markerPosition(id, this.v1);
    this.mapBand.localToWorld(this.v1);
    this.robot.point(this.v1);
  }

  private openPortal(index: number): void {
    this.portals.prefetch(index);
    this.portalShow = { index, appear: 0, out: 0, open: true };
  }

  private closePortal(now: boolean): void {
    if (this.portalShow.index < 0) return;
    this.portalShow.open = false;
    if (now) this.portalShow = { index: -1, appear: 0, out: 0, open: false };
    this.portals.hideDetails();
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

    if (this.mode === 'full' && this.phase === 'playing' && !this.clock.paused) {
      // An open history card eases time almost to a stop (and back).
      const rateTarget = this.portals.showingDetails ? 0.12 : 1;
      this.clock.rate += (rateTarget - this.clock.rate) * Math.min(1, dt / 0.5);
      this.clock.advance(dt);
      this.fireMoments();
      if (this.clock.ended) this.enterToday();
    } else if (this.mode === 'year') {
      this.updateYear(dt);
    }
    const p = this.clock.position;
    const flowing = (this.phase === 'playing' || this.phase === 'review') && !this.clock.paused && this.clock.rate > 0.05 && !(this.visit?.runner.holding ?? false);

    if (this.mode === 'full') {
      this.updateCaptions(dt);
      this.updateDecade(p, flowing);
    }
    // Event emphasis fades on real time, and waits while paused.
    if (flowing) for (let i = 0; i < this.focus.length; i++) this.focus[i] = Math.max(0, this.focus[i] - dt / FOCUS_HOLD_S);

    this.heads.fill(p);
    if (this.phase === 'today' && this.today) this.applyToday();
    else this.applyPosition(p);

    const turb = this.phase === 'today' ? 0.15 : Timeline.sample(this.timeline.turbulence, p);
    const floatBlend = Math.min(1, Math.max(0, (p - this.floatStartIndex + 20) / 40));

    // One moment, three bands.
    const yearMode = this.mode === 'year' && this.phase !== 'idle';
    this.chartFrame.solo = this.solo;
    this.chartFrame.turbulence = turb;
    this.chartFrame.spot = yearMode && !this.allCurrencies && this.solo < 0 ? this.spot : null;
    if (!yearMode) this.chartFrame.year = null;
    this.chart.update(dt, this.chartFrame);
    for (let i = 0; i < SLOTS.length; i++) {
      this.pct[i] = this.chart.headPct(i);
      this.late[i] = this.chart.isLate(i);
    }
    this.mapFrame.date = this.isoAt(p);
    this.mapFrame.solo = this.solo;
    this.mapFrame.flowing = flowing;
    this.mapFrame.spot = this.chartFrame.spot;
    this.map.setYearMode(yearMode);
    this.usdFocus = yearMode ? this.usdFocus : 0;
    this.mapFrame.usd = this.explore?.slot === USD_SLOT ? 1 : this.usdFocus;
    this.map.update(dt, this.mapFrame);
    this.updatePortals(dt, p, flowing);

    this.audio.update(this.voiceInputs, turb, floatBlend, flowing);
    this.ambience.update(dt, turb);
    this.robot.talking = this.guideLine !== null && (this.narration.speaking || this.guideAge < lineSeconds(this.guideLine) * 0.8);
    this.robot.update(dt, this.calm);
    this.tunnel.update(dt);
    // The veil hides the bands during the warp (the robot and hand panel stay).
    const hide = this.tunnel.active && this.tunnel.curtain > 0.9;
    for (const b of this.bands) b.visible = !hide;
    this.selector.update(dt);
    this.stage.yield = this.portals.visibility;
    this.stage.update(dt);
    this.captions.update(dt);
    this.skipIntro.update(dt);

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

  /** The Year Journey's clock, beats and phases. */
  private updateYear(dt: number): void {
    this.guideAge += dt;
    if (this.phase === 'intro') {
      this.introAge += dt;
      const line = this.guideLine ?? '';
      if (this.introAge >= lineSeconds(line) && !this.narration.speaking) this.nextIntroLine();
      return;
    }
    if (this.phase === 'select') {
      // A short line, then the robot waits (thinking) without repeating itself.
      if (this.guideLine && this.guideAge > lineSeconds(this.guideLine) + 1.5 && !this.narration.speaking) this.say(null, 'thinking');
      return;
    }
    if (this.phase === 'warp') {
      if (!this.warpRevealed && (this.tunnel.time >= this.tunnel.revealAt || !this.tunnel.active)) {
        this.warpRevealed = true;
        this.arrive(this.warpTarget);
        this.say(STRINGS.arrive(this.warpTarget), 'excited');
      }
      if (!this.tunnel.active) this.enterReview();
      return;
    }
    const v = this.visit;
    if (!v) return;
    if (this.phase === 'summary') {
      this.summaryAge += dt;
      if (this.guideLine && this.guideAge > lineSeconds(this.guideLine) && !this.narration.speaking) this.say(null, 'idle');
      this.refreshRegionView(dt);
      return;
    }
    if (this.phase !== 'review') return;
    const paused = this.clock.paused;
    if (!paused && !this.explore) {
      const started = v.runner.update(dt, this.clock.position, this.narration.speaking, false, (b) => ({
        minS: lineSeconds(b.text) * 0.8,
        maxS: lineSeconds(b.text) * 1.8 + 2,
      }));
      if (started) this.onBeat(started);
      else if (!v.runner.holding && this.guideLine && this.guideAge > 0.3) {
        // Between beats the subtitle clears and the robot relaxes; the year flows.
        this.say(null, 'idle');
        this.robot.point(null);
        this.closePortal(false);
      }
    }
    const hold = v.runner.holding || this.explore !== null;
    this.rateEase += ((hold ? 0 : 1) - this.rateEase) * Math.min(1, dt / 0.6);
    this.clock.rate = this.rateEase;
    this.clock.stopAt = hold ? this.clock.position : v.runner.stopAt;
    if (!paused) this.clock.advance(dt);
    this.refreshRegionView(dt);
    if (v.runner.doneAt(this.clock.position) && !this.explore && !this.narration.speaking) this.enterSummary();
  }

  /** The region view's live currency lines (a few times a second). */
  private refreshRegionView(dt: number): void {
    this.stageTimer -= dt;
    if (this.stageTimer > 0) return;
    this.stageTimer = 0.5;
    const r = this.explore?.region ?? this.stageRegion;
    if (r && this.stage.viewKind === 'region' && this.visit) this.stage.show(this.regionView(r));
  }

  /** ISO date at the playhead (today: the live rates' date). */
  private isoAt(p: number): string {
    if (this.phase === 'today' && this.today) return this.today.asOf;
    return this.timeline.dateAt(p).toISOString().slice(0, 10);
  }

  private isoOf(k: number): string {
    return this.timeline.dateAt(k).toISOString().slice(0, 10);
  }

  /** Display code of a slot (or USD) on a date: DEM before 1999. */
  private codeOn(slot: string, iso: string): string {
    if (slot === 'EUR' && iso < '1999-01-01') return 'DEM';
    return slot;
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
    const beat = this.visit ? `${this.visit.runner.index}/${this.visit.runner.beats.length}` : '-';
    const line =
      `[ctm] mode=${this.mode} phase=${this.phase} year=${year} beat=${beat} paused=${this.clock.paused} audio=${this.audio.ctx.state} ` +
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
        this.robot.mood = 'excited';
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
    if (this.mode === 'year') {
      // Year Journey: a portal opens for its event's beat and closes after it.
      const ps = this.portalShow;
      if (ps.index >= 0) {
        if (ps.open) ps.appear = Math.min(1, ps.appear + dt / 2.4);
        else ps.out = Math.min(1, ps.out + dt / 1.2);
        if (!ps.open && ps.out >= 1) ps.index = -1;
      }
      const hl = ps.open && ps.appear > 0.6 ? Math.min(1, (ps.appear - 0.6) / 0.4) : 0;
      this.portals.update(dt, { index: ps.index, appear: ps.appear, highlight: hl, out: ps.out, flowing: false, laneVisible: 0 });
      this.era.update(p, this.timeline.dateAt(p), eraAt(this.isoAt(p)), 0, false);
      this.readoutTimer -= dt;
      if (this.readoutTimer <= 0 && ps.index >= 0) {
        this.readoutTimer = 0.25;
        this.updateReadout(p);
      }
      return;
    }
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
      const rate = (idx: number) => s.firstRate / Math.exp(Timeline.sample(s.strength, idx));
      const word = CURRENCY_WORDS[this.timeline.codeAt(k, p)] ?? slot;
      // "On the date" is the last weekly observation on or before it: the
      // decision day itself may fall between observations (even on a Sunday),
      // and no rate is invented for it.
      lines.push(readoutLine(word, rate(Math.floor(at + 1e-9)), rate(p), p >= at));
    }
    this.portals.setReadout(lines);
  }

  // -------------------------------------------------------------------------
  // Captions & time (Full Journey)
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
      this.robot.talking = false;
      if (this.robot.mood === 'excited') this.robot.mood = 'idle';
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
  // Today (ending of the Full Journey)
  // -------------------------------------------------------------------------

  private enterToday(): void {
    this.phase = 'today';
    this.updatePanel();
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
    const yr = this.chartFrame.year;
    const months = Math.round((CHART.windowWeeks * 7) / 30.44);
    const since = yr ? `${shortDate(this.isoOf(yr.start))}, ${this.isoOf(yr.start).slice(0, 4)}` : '';
    let text = yr
      ? `Change in value vs ${base} since ${since} (the year's first weekly observation) · one scale · up = stronger`
      : `Change in value vs ${base} over the last ${months} months · one scale for all · up = stronger than the dollar`;
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
      } else if (yr) {
        const k = Math.floor(p + 1e-6);
        text = `${title}: ${b ? `${signed(b.headPct, 1)}% vs ${base} since ${b.late ? `its data begins (${shortDate(this.isoOf(s.first))})` : since}` : ''} · now ${formatRate(rateAt(s, k))} ${code} per ${base}  (pinch again to hear all)`;
      } else {
        const total = (Math.exp(Timeline.sample(s.strength, p)) - 1) * 100;
        const from = this.firstYear[i];
        const span = b?.late ? `since its data begins (${from})` : `in ${months} months`;
        text = `${title}: ${b ? `${signed(b.headPct, 1)}% vs ${base} ${span}` : ''} · since ${from}: ${signed(total, 0)}%  (pinch again to hear all)`;
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

function css(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/** A few words for a chart marker: the event's title, shortened. */
function shortTitle(title: string): string {
  const t = title.replace(/^The /, '').replace(/^"|"$/g, '');
  return t.length > 26 ? t.slice(0, 25).replace(/\s+\S*$/, '') + '…' : t;
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
