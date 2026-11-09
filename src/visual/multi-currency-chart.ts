/**
 * Multi-Currency Timeline: the middle band. Nine glowing lines flow from
 * right to left with time; the right edge is the playhead ("now"), the left
 * edge 52 weeks ago.
 *
 *   x            time (the same 52 weeks at any playback speed)
 *   y            change in value vs the US dollar since the window's start,
 *                in percent, on ONE scale shared by all lines (up = stronger)
 *   thickness    how fast the currency was moving at that time
 *   head orb     a small glowing sphere at the newest point: the orb of the
 *                earlier design, shrunk; it pulses with the currency's notes
 *
 * The lines are sampled from the weekly data every frame (trail-sampling.ts,
 * chart-series.ts), never recorded frame by frame: pausing stops the flow,
 * and a jump (chapter, Replay) shows the right history at once, with a short
 * glide from the old picture. Weeks without data are never drawn.
 *
 * Emphasis, shared with the map: a currency in a historical event gets a
 * brighter, thicker line; a soloed currency comes first and the others fade
 * (never vanish). Right-hand labels ("JPY ▲ +8.4%") are spread so they never
 * overlap, with a leader line when a label had to move.
 *
 * Quest budget: one dynamic strip mesh per line, a few line sets and small
 * canvas labels redrawn only when their text changes. No post-processing.
 */
import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';
import { CHART } from '../config.js';
import { changeSeries, changeText, chartRange, niceTicks, spreadLabels, tickLabel, type ChangeBase } from '../data/chart-series.js';
import { haloTexture, noRaycast, Ribbon, Segments, SparkCloud, TextPlane, Track } from './glow.js';
import { createSamples, interpByAge, maxTrailPoints, sampleTrail, valueAt, type TrailSamples, type TrailTail } from './trail-sampling.js';

export interface ChartSeries {
  first: number;
  strength: Float32Array;
  vol: Float32Array;
}

export interface ChartFrame {
  /** Playhead per line (week index); they differ only in the today ending. */
  heads: Float64Array;
  /** Optional latest-rate point after the weekly history (today). */
  tails: (TrailTail | null)[];
  /** 0..1 event emphasis per line. */
  focus: number[];
  /** 0..1 head brightness per line (short-term momentum). */
  brightness: number[];
  /** Soloed line, or -1. */
  solo: number;
  /** Display code per line (DEM before 1999, then EUR). */
  codes: string[];
  turbulence: number;
}

/** A dated event that gets a marker line once the playhead has passed it. */
export interface ChartEvent {
  t: number;
  label: string;
}

const MAX_GRID = 9;
const MAX_YEARS = 3;
const MAX_EVENT_MARKS = 3;
const WHITE = new Color(1, 1, 1);
const EVENT_COLOR = new Color(1, 0.86, 0.55);
const GLOW_DECAY_S = 0.9;
const MAX_BRIGHTNESS_SLEW = 1.6;

/** The glowing head of a line (the former orb, small). Brightness is slew limited: it never flashes. */
class HeadOrb {
  readonly group = new Group();
  private readonly coreMat: MeshBasicMaterial;
  private readonly haloMat: SpriteMaterial;
  private readonly halo: Sprite;
  private readonly core: Mesh;
  private readonly base: Color;
  private glow = 0;
  private shown = 0;

  constructor(color: Color) {
    this.base = color.clone();
    this.coreMat = new MeshBasicMaterial({ color: color.clone(), toneMapped: false, transparent: true });
    this.core = noRaycast(new Mesh(new SphereGeometry(0.0085, 16, 12), this.coreMat));
    this.haloMat = new SpriteMaterial({
      map: haloTexture(),
      color: color.clone(),
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    });
    this.halo = noRaycast(new Sprite(this.haloMat));
    this.group.add(this.halo, this.core);
    this.group.renderOrder = 6;
    this.core.renderOrder = 6;
    this.halo.renderOrder = 5;
  }

  pulse(velocity: number): void {
    this.glow = Math.max(this.glow, 0.35 + 0.4 * velocity);
  }

  update(dt: number, alive: boolean, brightness: number, emphasis: number, keep: number): void {
    this.group.visible = alive && keep > 0.02;
    this.glow *= Math.exp(-dt / GLOW_DECAY_S);
    const target = Math.min(1.6, 0.45 + 0.45 * brightness + this.glow + 0.35 * emphasis);
    const step = MAX_BRIGHTNESS_SLEW * dt;
    this.shown += Math.max(-step, Math.min(step, target - this.shown));
    const b = this.shown;
    this.coreMat.color.copy(this.base).multiplyScalar(0.4 + 0.6 * Math.min(1, b));
    this.coreMat.opacity = Math.min(1, 0.3 + keep);
    this.haloMat.opacity = Math.min(0.85, 0.12 + 0.5 * b) * keep;
    this.halo.scale.setScalar(0.03 + 0.03 * Math.min(1, b) + 0.015 * emphasis);
    this.core.scale.setScalar(1 + 0.35 * emphasis);
  }

  dispose(): void {
    this.core.geometry.dispose();
    this.coreMat.dispose();
    this.haloMat.dispose();
  }
}

export class MultiCurrencyChart {
  /** Add to the chart band group (band-local meters). */
  readonly root = new Group();
  /** One invisible pinch target per line (covers its label); see experience.ts. */
  readonly hits: Mesh[];

  private readonly series: ChartSeries[];
  private readonly colors: Color[];
  private readonly css: string[];
  private readonly sparkColors: Color[];
  private readonly samples: TrailSamples[];
  private readonly tracks: Track[];
  private readonly pct: Float32Array[];
  private readonly bases: (ChangeBase | null)[];
  private readonly ribbons: Ribbon[];
  private readonly orbs: HeadOrb[];
  private readonly labels: TextPlane[];
  private readonly emphasis: Float32Array;
  private readonly keep: Float32Array;
  private readonly pulse: Float32Array;
  private readonly heads: Float64Array;
  private readonly events: ChartEvent[];
  private readonly yearIndex: (year: number) => number;
  private readonly yearAt: (index: number) => number;

  private readonly grid: Segments;
  private readonly zero: Segments;
  private readonly timeGrid: Segments;
  private readonly eventLines: Segments;
  private readonly leaders: Segments;
  private readonly gridLabels: TextPlane[] = [];
  private readonly yearLabels: TextPlane[] = [];
  private readonly eventLabels: TextPlane[] = [];
  private readonly header: TextPlane;
  private readonly dateLabel: TextPlane;
  private readonly footnote: TextPlane;
  private readonly notes: SparkCloud;
  private readonly markers: SparkCloud;
  private readonly v = new Vector3();

  private lo = -3;
  private hi = 3;
  private rangeReady = false;
  private clipped = -1;
  private boost = 0;
  private boostTarget = 0;
  private now = 0;
  private headerText = '';
  private dateText = '';
  private soloShown = 0;
  private textTimer = 0;
  private readonly labelText: string[];

  constructor(
    series: ChartSeries[],
    colors: number[],
    events: ChartEvent[],
    yearIndex: (year: number) => number,
    yearAt: (index: number) => number,
  ) {
    this.series = series;
    this.events = events;
    this.yearIndex = yearIndex;
    this.yearAt = yearAt;
    const n = series.length;
    const W = CHART.windowWeeks;
    const maxPts = maxTrailPoints(W);
    this.colors = colors.map((c) => new Color(c));
    this.css = this.colors.map((c) => '#' + c.getHexString());
    this.sparkColors = this.colors.map((c) => c.clone().lerp(WHITE, 0.45));
    this.samples = series.map(() => createSamples(W));
    this.tracks = series.map(() => new Track(maxPts));
    this.pct = series.map(() => new Float32Array(maxPts));
    this.bases = series.map(() => null);
    this.emphasis = new Float32Array(n);
    this.keep = new Float32Array(n).fill(1);
    this.pulse = new Float32Array(n);
    this.heads = new Float64Array(n);
    this.labelText = series.map(() => '');

    const Hh = CHART.plotHalfHeight;
    const L = CHART.plotLeft;
    const R = CHART.plotRight;

    // Backing plate: a dark glass so the lines read on any sky.
    const back = noRaycast(
      new Mesh(
        new PlaneGeometry(1.74, 0.44),
        new MeshBasicMaterial({ color: 0x050a16, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
      ),
    );
    back.position.z = -0.004;
    back.renderOrder = 0;
    const frame = new Segments(4, 0x8496bd, 0.28);
    frame.begin();
    frame.add(L, -Hh, R, -Hh);
    frame.add(L, Hh, R, Hh);
    frame.add(L, -Hh, L, Hh);
    frame.add(R, -Hh, R, Hh);
    frame.end();

    this.grid = new Segments(MAX_GRID + 64, 0x8496bd, 0.16);
    this.zero = new Segments(1, 0xdfe7f7, 0.6);
    this.timeGrid = new Segments(MAX_YEARS + 8, 0x8496bd, 0.2);
    this.eventLines = new Segments(MAX_EVENT_MARKS, 0xffdc8c, 0.45);
    this.leaders = new Segments(n, 0xc8d2e6, 0.4);
    this.root.add(back, frame.lines, this.grid.lines, this.zero.lines, this.timeGrid.lines, this.eventLines.lines, this.leaders.lines);

    for (let k = 0; k < MAX_GRID; k++) {
      const t = new TextPlane(0.075, 0.022, 44);
      t.mesh.position.x = L - 0.042;
      this.gridLabels.push(t);
      this.root.add(t.mesh);
    }
    for (let k = 0; k < MAX_YEARS; k++) {
      const t = new TextPlane(0.08, 0.024, 48);
      t.mesh.position.y = -Hh - 0.02;
      this.yearLabels.push(t);
      this.root.add(t.mesh);
    }
    for (let k = 0; k < MAX_EVENT_MARKS; k++) {
      const t = new TextPlane(0.2, 0.024, 48);
      t.mesh.position.y = Hh - 0.016;
      this.eventLabels.push(t);
      this.root.add(t.mesh);
    }
    this.header = new TextPlane(1.0, 0.032, 64);
    this.header.mesh.position.set(L + 0.5, Hh + 0.038, 0);
    this.dateLabel = new TextPlane(0.5, 0.05, 100);
    this.dateLabel.mesh.position.set(R + 0.25 - 0.5 / 2 + 0.03, Hh + 0.045, 0);
    this.footnote = new TextPlane(1.2, 0.022, 44);
    this.footnote.mesh.position.set(L + 0.6, -Hh - 0.045, 0);
    this.root.add(this.header.mesh, this.dateLabel.mesh, this.footnote.mesh);

    this.ribbons = this.colors.map((c) => {
      const r = new Ribbon(maxPts, c, 0.7, 0.24);
      r.mesh.position.z = 0.003;
      this.root.add(r.mesh);
      return r;
    });
    this.orbs = this.colors.map((c) => {
      const o = new HeadOrb(c);
      this.root.add(o.group);
      return o;
    });
    this.labels = series.map(() => {
      const t = new TextPlane(CHART.labelWidth, CHART.labelHeight, 60);
      t.mesh.position.x = CHART.labelX + CHART.labelWidth / 2;
      t.mesh.position.z = 0.004;
      this.root.add(t.mesh);
      return t;
    });
    // Pinch targets: invisible planes over the labels (hit-testable only while alive).
    this.hits = series.map((_, i) => {
      const m = new Mesh(
        new PlaneGeometry(CHART.labelWidth + 0.03, CHART.labelGap),
        new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
      );
      m.name = `chart-label-${i}`;
      m.position.set(CHART.labelX + CHART.labelWidth / 2 - 0.015, 0, 0.01);
      m.raycast = () => {};
      this.root.add(m);
      return m;
    });

    this.notes = new SparkCloud(96, 0.011);
    this.markers = new SparkCloud(24, 0.024);
    for (const c of [this.notes, this.markers]) c.points.position.z = 0.005;
    this.root.add(this.notes.points, this.markers.points);
  }

  /** Percent change at the head of line i (null: no data yet). Same number as the map shows. */
  headPct(i: number): number | null {
    const b = this.bases[i];
    return b ? b.headPct : null;
  }

  /** Line i starts later than the window (its data begins inside it). */
  isLate(i: number): boolean {
    return this.bases[i]?.late ?? false;
  }

  /** Displayed height of line i's head (band-local meters), for the voices. */
  headY(i: number): number {
    const t = this.tracks[i];
    return t.count > 0 ? t.ys[t.count - 1] : 0;
  }

  /** Window start of line i (week index) and whether it is cut by the data's start. */
  baseOf(i: number): ChangeBase | null {
    return this.bases[i];
  }

  /** Header text (soloed currency's numbers), set by the experience a few times a second. */
  setHeader(text: string): void {
    this.headerText = text;
  }

  /** The playhead's date, shown large at the top right ("September 1985"). */
  setDate(date: string): void {
    this.dateText = date;
  }

  /** The playhead is about to jump: glide from what is shown now. */
  beginMorph(): void {
    this.tracks.forEach((tr, i) => tr.morph.capture(tr.count, this.samples[i].age, tr.ys, tr.vis));
    this.notes.items.length = 0;
    this.markers.items.length = 0;
  }

  /** A note became audible on line i: its head glows and leaves a spark. */
  note(i: number, velocity: number): void {
    if (this.heads[i] < this.series[i].first) return;
    this.orbs[i].pulse(velocity);
    this.pulse[i] = Math.max(this.pulse[i], 0.25 + 0.35 * velocity);
    this.notes.add({ slot: i, t: this.heads[i], born: this.now, shown: this.now, vel: velocity });
  }

  /** Pin a warm marker at a historical date on line i (shown once the date is reached). */
  markEvent(i: number, index: number): void {
    this.markers.add({ slot: i, t: index, born: this.now, shown: -1, vel: 1 });
  }

  /** A major moment: every line becomes clearer for a few seconds. */
  boostAll(): void {
    this.boostTarget = 1;
  }

  reset(): void {
    this.notes.items.length = 0;
    this.markers.items.length = 0;
    this.pulse.fill(0);
    this.emphasis.fill(0);
    this.boost = this.boostTarget = 0;
  }

  private yOf(pct: number): number {
    const Hh = CHART.plotHalfHeight;
    return -Hh + ((pct - this.lo) / (this.hi - this.lo)) * 2 * Hh;
  }

  update(dt: number, f: ChartFrame): void {
    this.now += dt;
    const n = this.series.length;
    const W = CHART.windowWeeks;
    const L = CHART.plotLeft;
    const R = CHART.plotRight;
    const Hh = CHART.plotHalfHeight;
    this.boost += (this.boostTarget - this.boost) * Math.min(1, dt / 0.8);
    this.boostTarget = Math.max(0, this.boostTarget - dt / 6);
    this.soloShown += ((f.solo >= 0 ? 1 : 0) - this.soloShown) * Math.min(1, dt / 0.35);
    let maxFocus = 0;
    for (let i = 0; i < n; i++) maxFocus = Math.max(maxFocus, f.focus[i]);

    // 1. Sample every line and convert it to change since the common start.
    let now = 0;
    for (let i = 0; i < n; i++) {
      const s = this.series[i];
      const head = f.heads[i];
      this.heads[i] = head;
      now = Math.max(now, head);
      sampleTrail(s.strength, s.first, head, W, this.samples[i], f.tails[i]);
      this.bases[i] = changeSeries(this.samples[i], head - W, this.pct[i]);
    }

    // 2. One shared y-range for all lines (focus and solo stay fully on it).
    const keep = f.focus.map((x, i) => x > 0.3 || i === f.solo);
    const target = chartRange(this.bases, keep);
    this.clipped = target.clipped;
    if (!this.rangeReady) {
      this.lo = target.lo;
      this.hi = target.hi;
      this.rangeReady = true;
    } else {
      const k = Math.min(1, dt / 0.6);
      this.lo += (target.lo - this.lo) * k;
      this.hi += (target.hi - this.hi) * k;
    }

    // 3. Lines, emphasis and head orbs.
    const headYs: number[] = [];
    const alive: number[] = [];
    for (let i = 0; i < n; i++) {
      const smp = this.samples[i];
      const tr = this.tracks[i];
      const pct = this.pct[i];
      const cnt = smp.count;
      tr.count = cnt;
      for (let k = 0; k < cnt; k++) {
        tr.xs[k] = R - (R - L) * smp.age[k];
        tr.ys[k] = this.yOf(pct[k]);
      }
      tr.morph.apply(cnt, smp.age, tr.ys, smp.valid, tr.vis, dt);
      for (let k = 0; k < cnt; k++) {
        // An off-scale outlier runs along the edge, faint (its label gives the true number).
        if (tr.ys[k] > Hh || tr.ys[k] < -Hh) {
          tr.ys[k] = Math.max(-Hh, Math.min(Hh, tr.ys[k]));
          tr.vis[k] *= 0.35;
        }
      }

      const solo = f.solo === i ? 1 : 0;
      this.emphasis[i] += (Math.max(f.focus[i], solo) - this.emphasis[i]) * Math.min(1, dt / 0.5);
      const e = this.emphasis[i];
      // Others step back while one is soloed (never below 25%), or a little during an event.
      const others = f.solo >= 0 && f.solo !== i ? 1 - 0.75 * this.soloShown : 1 - 0.45 * maxFocus * (1 - f.focus[i]);
      this.keep[i] = others;
      const thick = (1 + 0.7 * e) * (f.solo === i ? 1.25 : 1);
      for (let k = 0; k < cnt; k++) {
        const v = valueAt(this.series[i].vol, smp.t[k]);
        tr.hw[k] = (CHART.halfWidthBase + CHART.halfWidthVol * Math.tanh(v / 0.012)) * thick;
      }
      const ribbon = this.ribbons[i];
      ribbon.write(cnt, tr.xs, tr.ys, smp.age, tr.vis, tr.hw);
      this.pulse[i] *= Math.exp(-dt / 0.6);
      const busy = Math.tanh(valueAt(this.series[i].vol, this.heads[i]) / 0.012);
      const base = (0.5 + 0.3 * busy) * (1 + 0.25 * f.turbulence) + 0.6 * e + 0.25 * this.boost;
      ribbon.mat.uniforms.uIntensity.value = Math.min(1.7, base) * others;
      ribbon.mat.uniforms.uHead.value = this.pulse[i] * others;

      const isAlive = this.bases[i] !== null;
      if (isAlive) {
        headYs.push(tr.ys[cnt - 1]);
        alive.push(i);
        this.orbs[i].group.position.set(tr.xs[cnt - 1], tr.ys[cnt - 1], 0.008);
      }
      this.orbs[i].update(dt, isAlive, f.brightness[i], e, others);
    }

    // 4. Right-hand labels: spread apart, leader lines when moved.
    // (The top label stays clear of the date above the chart.)
    const spread = spreadLabels(headYs, CHART.labelGap, -Hh - 0.02, Hh - 0.002);
    this.leaders.begin();
    const shown = new Set(alive);
    alive.forEach((i, j) => {
      const y = spread[j];
      const lab = this.labels[i];
      lab.mesh.position.y = y;
      this.hits[i].position.y = y;
      lab.mat.opacity = Math.max(0.35, this.keep[i]);
      this.leaders.add(R + 0.012, headYs[j], CHART.labelX - 0.004, y, 0.002);
    });
    this.leaders.end();
    for (let i = 0; i < n; i++) {
      const on = shown.has(i);
      this.labels[i].mesh.visible = on;
      this.hits[i].raycast = on ? Mesh.prototype.raycast : () => {};
    }

    this.updateGrid(now);
    this.updateTime(now);
    this.updateSparks(dt);

    // The date follows the playhead exactly (redrawn only when the month changes).
    this.dateLabel.mat.opacity = 1;
    this.dateLabel.draw(this.dateText, (ctx, w, h) => {
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.font = `bold ${Math.round(h * 0.8)}px system-ui, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.dateText, w - 4, h / 2);
    });
    // Other texts a few times a second (canvas uploads cost).
    this.textTimer -= dt;
    if (this.textTimer <= 0) {
      this.textTimer = 0.2;
      this.drawTexts(f, alive);
    }
  }

  private updateGrid(now: number): void {
    const L = CHART.plotLeft;
    const R = CHART.plotRight;
    const Hh = CHART.plotHalfHeight;
    const ticks = niceTicks(this.lo, this.hi, 4);
    this.grid.begin();
    let used = 0;
    for (const v of ticks) {
      const y = this.yOf(v);
      if (y < -Hh - 1e-6 || y > Hh + 1e-6) continue;
      if (v !== 0) this.grid.add(L, y, R, y);
      if (used < MAX_GRID) {
        const t = this.gridLabels[used++];
        t.mesh.position.y = y;
        t.mat.opacity = v === 0 ? 0.95 : 0.7;
        const text = tickLabel(v);
        t.draw(text, (ctx, w, h) => {
          ctx.font = `${v === 0 ? 'bold ' : ''}${Math.round(h * 0.72)}px system-ui, sans-serif`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = v === 0 ? '#f2f5fb' : '#b7c3db';
          ctx.fillText(text, w - 4, h / 2);
        });
      }
    }
    for (let k = used; k < MAX_GRID; k++) this.gridLabels[k].mat.opacity = 0;
    // Time marks pinned to fixed weeks along the bottom: they flow even when rates are flat.
    const W = CHART.windowWeeks;
    const step = CHART.tickWeeks;
    for (let t = Math.ceil((now - W) / step) * step; t <= now; t += step) {
      const x = R - ((R - L) * (now - t)) / W;
      this.grid.add(x, -Hh, x, -Hh + 0.012);
    }
    this.grid.end();
    this.zero.begin();
    const y0 = this.yOf(0);
    this.zero.add(L, y0, R, y0, 0.002);
    this.zero.end();
  }

  /** Year lines (scrolling with the data) and markers at the actual dates of events already reached. */
  private updateTime(now: number): void {
    const L = CHART.plotLeft;
    const R = CHART.plotRight;
    const Hh = CHART.plotHalfHeight;
    const W = CHART.windowWeeks;
    const xAt = (t: number) => R - ((R - L) * (now - t)) / W;
    this.timeGrid.begin();
    let used = 0;
    const y1 = this.yearAt(now);
    for (let y = y1; y > y1 - 3 && used < MAX_YEARS; y--) {
      const t = this.yearIndex(y);
      const age = (now - t) / W;
      if (age < 0 || age > 1) continue;
      const x = xAt(t);
      this.timeGrid.add(x, -Hh, x, Hh);
      const label = this.yearLabels[used++];
      label.mesh.position.x = x;
      label.mat.opacity = 0.85 * Math.min(1, (1 - age) * 6) * Math.min(1, age * 30 + 0.2);
      label.draw(String(y), (ctx, w, h) => {
        ctx.font = `${Math.round(h * 0.78)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#c9d3e8';
        ctx.fillText(String(y), w / 2, h / 2);
      });
    }
    for (let k = used; k < MAX_YEARS; k++) this.yearLabels[k].mat.opacity = 0;
    this.timeGrid.end();

    this.eventLines.begin();
    let ev = 0;
    for (let j = this.events.length - 1; j >= 0 && ev < MAX_EVENT_MARKS; j--) {
      const e = this.events[j];
      const age = (now - e.t) / W;
      if (age < 0 || age > 1) continue; // future events are never shown early
      const x = xAt(e.t);
      this.eventLines.add(x, -Hh, x, Hh - 0.03, 0.0015);
      const label = this.eventLabels[ev++];
      label.mesh.position.x = Math.min(R - 0.1, Math.max(L + 0.1, x));
      label.mat.opacity = 0.9 * Math.min(1, (1 - age) * 5);
      label.draw(e.label, (ctx, w, h) => {
        ctx.font = `bold ${Math.round(h * 0.72)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffdc8c';
        ctx.fillText(e.label, w / 2, h / 2);
      });
    }
    for (let k = ev; k < MAX_EVENT_MARKS; k++) this.eventLabels[k].mat.opacity = 0;
    this.eventLines.end();
  }

  private updateSparks(dt: number): void {
    const W = CHART.windowWeeks;
    const L = CHART.plotLeft;
    const R = CHART.plotRight;
    void dt;
    for (const cloud of [this.notes, this.markers]) {
      const isMarker = cloud === this.markers;
      cloud.begin();
      for (let j = cloud.items.length - 1; j >= 0; j--) {
        const sp = cloud.items[j];
        const head = this.heads[sp.slot];
        const age = (head - sp.t) / W;
        const life = this.now - sp.born;
        if (age > 1 || (!isMarker && life > 6) || sp.t < this.series[sp.slot].first) {
          cloud.items.splice(j, 1);
          continue;
        }
        if (age < 0) continue; // a date the playhead has not reached yet
        if (sp.shown < 0) sp.shown = this.now;
        const fadeIn = Math.min(1, (this.now - sp.shown) / (isMarker ? 0.5 : 0.15));
        const along = Math.pow(1 - age, isMarker ? 0.7 : 1.2);
        const a = isMarker ? 0.85 * fadeIn * along : sp.vel * 0.8 * fadeIn * along * Math.exp(-life / 1.8);
        const tr = this.tracks[sp.slot];
        const y = interpByAge(tr.count, this.samples[sp.slot].age, tr.ys, age);
        this.v.set(R - (R - L) * age, y, 0);
        cloud.put(this.v, isMarker ? EVENT_COLOR : this.sparkColors[sp.slot], a * this.keep[sp.slot]);
      }
      cloud.end();
    }
  }

  private drawTexts(f: ChartFrame, alive: number[]): void {
    for (const i of alive) {
      const b = this.bases[i]!;
      const code = f.codes[i] + (b.late ? '*' : '');
      const off = i === this.clipped ? '  off scale' : '';
      const value = changeText(b.headPct) + off;
      const key = `${code}|${value}`;
      if (key === this.labelText[i]) continue;
      this.labelText[i] = key;
      const color = this.css[i];
      this.labels[i].draw(key, (ctx, w, h) => {
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(h * 0.7)}px system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(4,7,14,0.6)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = color;
        ctx.fillText(code, 8, h / 2);
        const cw = ctx.measureText(code + ' ').width;
        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.round(h * 0.66)}px system-ui, sans-serif`;
        ctx.fillText(value, 8 + cw + 4, h / 2);
      });
    }

    this.header.mat.opacity = 0.95;
    this.header.draw(this.headerText, (ctx, w, h) => {
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(h * 0.66)}px system-ui, sans-serif`;
      ctx.fillStyle = '#dfe6f4';
      ctx.fillText(this.headerText, 4, h / 2);
    });
    // Footnote: lines measured from a later start, and a line left off the scale.
    const late = alive.filter((i) => this.bases[i]!.late).map((i) => f.codes[i]);
    const parts: string[] = [];
    if (late.length) parts.push(`* ${late.join(', ')}: change since its data begins (inside this window)`);
    if (this.clipped >= 0 && this.bases[this.clipped]) parts.push(`${f.codes[this.clipped]} is off the scale; its label gives the true change`);
    const note = parts.join('   ·   ');
    this.footnote.mat.opacity = note ? 0.85 : 0;
    this.footnote.draw(note, (ctx, w, h) => {
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(h * 0.7)}px system-ui, sans-serif`;
      ctx.fillStyle = '#aeb9d0';
      ctx.fillText(note, 4, h / 2);
    });
  }

  dispose(): void {
    this.ribbons.forEach((r) => r.dispose());
    this.orbs.forEach((o) => o.dispose());
    this.labels.forEach((l) => l.dispose());
    [...this.gridLabels, ...this.yearLabels, ...this.eventLabels, this.header, this.dateLabel, this.footnote].forEach((t) => t.dispose());
    [this.grid, this.zero, this.timeGrid, this.eventLines, this.leaders].forEach((s) => s.dispose());
    this.notes.dispose();
    this.markers.dispose();
    this.hits.forEach((h) => {
      h.geometry.dispose();
      (h.material as MeshBasicMaterial).dispose();
    });
    this.root.removeFromParent();
  }
}

