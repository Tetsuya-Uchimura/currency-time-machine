/**
 * Temporal Light Trails: every orb drags a ribbon of light made of its own
 * recent history. The orb is the present; the ribbon behind it (to its left)
 * is the past year, flowing away as time moves on.
 *
 *   x (along the ribbon)  time: the head is "now", the far end is a year ago
 *   y                     strength vs USD, on the same scale as the orb height
 *   thickness             how fast the currency was moving at that time
 *   brightness            newer is brighter; busier markets glow more
 *
 * Compact trails sit beside each orb (all nine at once). Pinching an orb opens
 * the expanded lane: one currency, larger, auto-zoomed (and labelled as such).
 *
 * The shapes are sampled from the weekly data every frame (trail-sampling.ts),
 * never recorded frame by frame. Rendering is cheap for Quest: one small
 * dynamic ribbon mesh per trail, with a custom additive shader for the glowing
 * core (no post-processing), plus two point clouds for sparks. Nothing here is
 * interactive: raycasting is disabled so pinches reach the orbs and panels.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Line,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  PlaneGeometry,
  Points,
  PointsMaterial,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from '@iwsdk/core';
import { LANE, LAYOUT, strengthToHeight, TRAIL } from '../config.js';
import { haloTexture } from './orbs.js';
import {
  compactTrailLength,
  createSamples,
  interpByAge,
  maxTrailPoints,
  sampleTrail,
  TrailMorph,
  valueAt,
  windowChange,
  zoomTarget,
  type TrailSamples,
  type TrailTail,
} from './trail-sampling.js';

/** What the trails need from each currency's history. */
export interface TrailSeries {
  first: number;
  strength: Float32Array;
  vol: Float32Array;
}

export interface TrailFrame {
  /** Playback head per slot (week index); differs per slot only at "today". */
  heads: Float64Array;
  /** Optional latest-rate point after the weekly history (today). */
  tails: (TrailTail | null)[];
  /** 0..1 event highlight per slot. */
  focus: number[];
  turbulence: number;
}

const noRaycast = (o: Object3D) => {
  o.raycast = () => {};
  return o;
};

// ---------------------------------------------------------------------------
// Ribbon: a dynamic triangle strip with a glowing core
// ---------------------------------------------------------------------------

const RIBBON_VERT = /* glsl */ `
  attribute float aAcross;
  attribute float aAge;
  attribute float aVis;
  varying float vAcross;
  varying float vAge;
  varying float vVis;
  void main() {
    vAcross = aAcross;
    vAge = aAge;
    vVis = aVis;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const RIBBON_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uHead;
  uniform float uFade;
  uniform float uCore;
  varying float vAcross;
  varying float vAge;
  varying float vVis;
  void main() {
    float d = abs(vAcross);
    // Bright, slightly whitened core inside a soft colored glow.
    float core = 1.0 - smoothstep(uCore * 0.45, uCore, d);
    float glow = (1.0 - d) * (1.0 - d);
    float along = pow(clamp(1.0 - vAge, 0.0, 1.0), uFade);
    float head = uHead * exp(-vAge * 12.0);
    float a = vVis * along * (uIntensity + head);
    vec3 c = uColor * glow * 0.9 + mix(uColor, vec3(1.0), 0.3) * core * 0.8;
    gl_FragColor = vec4(c * a, 1.0);
    #include <colorspace_fragment>
  }`;

class Ribbon {
  readonly mesh: Mesh;
  readonly mat: ShaderMaterial;
  private readonly geo: BufferGeometry;
  private readonly pos: BufferAttribute;
  private readonly age: BufferAttribute;
  private readonly vis: BufferAttribute;

  constructor(maxPoints: number, color: Color, fade: number, core: number) {
    const nv = maxPoints * 2;
    this.geo = new BufferGeometry();
    this.pos = new BufferAttribute(new Float32Array(nv * 3), 3).setUsage(DynamicDrawUsage);
    this.age = new BufferAttribute(new Float32Array(nv), 1).setUsage(DynamicDrawUsage);
    this.vis = new BufferAttribute(new Float32Array(nv), 1).setUsage(DynamicDrawUsage);
    const across = new Float32Array(nv);
    for (let k = 0; k < maxPoints; k++) {
      across[2 * k] = -1;
      across[2 * k + 1] = 1;
    }
    const index: number[] = [];
    for (let k = 0; k < maxPoints - 1; k++) {
      const a = 2 * k;
      // Counter-clockwise as seen from the user (front faces).
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    this.geo.setIndex(index);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('aAcross', new Float32BufferAttribute(across, 1));
    this.geo.setAttribute('aAge', this.age);
    this.geo.setAttribute('aVis', this.vis);
    this.geo.setDrawRange(0, 0);

    this.mat = new ShaderMaterial({
      uniforms: {
        uColor: { value: color.clone() },
        uIntensity: { value: 0 },
        uHead: { value: 0 },
        uFade: { value: fade },
        uCore: { value: core },
      },
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      toneMapped: false,
    });
    this.mesh = noRaycast(new Mesh(this.geo, this.mat)) as Mesh;
    this.mesh.frustumCulled = false; // vertices move every frame
    this.mesh.renderOrder = 3;
  }

  /** Rebuild the strip from a polyline (x, y), half-width per vertex. */
  write(n: number, xs: Float32Array, ys: Float32Array, ages: ArrayLike<number>, vis: ArrayLike<number>, hw: Float32Array): void {
    const p = this.pos.array as Float32Array;
    const ag = this.age.array as Float32Array;
    const vs = this.vis.array as Float32Array;
    let nx = 0;
    let ny = 1;
    for (let k = 0; k < n; k++) {
      // Normal from the neighbors (central difference); keep the last one
      // across zero-length segments (collapsed no-data vertices).
      const k0 = Math.max(0, k - 1);
      const k1 = Math.min(n - 1, k + 1);
      const dx = xs[k1] - xs[k0];
      const dy = ys[k1] - ys[k0];
      const len = Math.hypot(dx, dy);
      if (len > 1e-7) {
        nx = -dy / len;
        ny = dx / len;
      }
      const w = hw[k];
      const i = 6 * k;
      p[i] = xs[k] - nx * w;
      p[i + 1] = ys[k] - ny * w;
      p[i + 2] = 0;
      p[i + 3] = xs[k] + nx * w;
      p[i + 4] = ys[k] + ny * w;
      p[i + 5] = 0;
      ag[2 * k] = ag[2 * k + 1] = ages[k];
      vs[2 * k] = vs[2 * k + 1] = vis[k];
    }
    this.pos.needsUpdate = true;
    this.age.needsUpdate = true;
    this.vis.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------------------
// One track = one sampled window drawn somewhere (compact or lane)
// ---------------------------------------------------------------------------

class Track {
  readonly xs: Float32Array;
  readonly ys: Float32Array;
  readonly vis: Float32Array;
  readonly hw: Float32Array;
  readonly morph = new TrailMorph();
  count = 0;
  constructor(maxPoints: number) {
    this.xs = new Float32Array(maxPoints);
    this.ys = new Float32Array(maxPoints);
    this.vis = new Float32Array(maxPoints);
    this.hw = new Float32Array(maxPoints);
  }
}

// ---------------------------------------------------------------------------
// Sparks: small lights pinned to a moment in time, so they scroll with the data
// ---------------------------------------------------------------------------

const MAX_SPARKS = 96;
const MAX_MARKERS = 24;

interface Spark {
  slot: number;
  /** Week index the spark belongs to. */
  t: number;
  /** Real time it was created (s). */
  born: number;
  /** Real time it first became visible (markers wait for the head). */
  shown: number;
  vel: number;
}

class SparkCloud {
  readonly points: Points;
  private readonly geo = new BufferGeometry();
  private readonly pos: BufferAttribute;
  private readonly col: BufferAttribute;
  readonly items: Spark[] = [];
  n = 0;

  private readonly capacity: number;

  constructor(capacity: number, size: number) {
    this.capacity = capacity;
    const cap = capacity * 2; // compact + lane copy
    this.pos = new BufferAttribute(new Float32Array(cap * 3), 3).setUsage(DynamicDrawUsage);
    this.col = new BufferAttribute(new Float32Array(cap * 4), 4).setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('color', this.col);
    this.geo.setDrawRange(0, 0);
    const mat = new PointsMaterial({
      size,
      map: haloTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    this.points = noRaycast(new Points(this.geo, mat)) as Points;
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  add(s: Spark): void {
    if (this.items.length >= this.capacity) this.items.shift();
    this.items.push(s);
  }

  begin(): void {
    this.n = 0;
  }

  put(v: Vector3, c: Color, a: number): void {
    if (a <= 0.003 || this.n >= this.capacity * 2) return;
    const i = this.n++;
    const p = this.pos.array as Float32Array;
    const q = this.col.array as Float32Array;
    p[i * 3] = v.x;
    p[i * 3 + 1] = v.y;
    p[i * 3 + 2] = v.z;
    q[i * 4] = c.r;
    q[i * 4 + 1] = c.g;
    q[i * 4 + 2] = c.b;
    q[i * 4 + 3] = Math.min(1, a);
  }

  end(): void {
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as PointsMaterial).dispose();
  }
}

// ---------------------------------------------------------------------------
// Small canvas text plane (lane header/footer, year ticks)
// ---------------------------------------------------------------------------

class TextPlane {
  readonly mesh: Mesh;
  readonly mat: MeshBasicMaterial;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private key = '';

  constructor(w: number, h: number, px: number) {
    this.canvas.width = Math.round(px * (w / h));
    this.canvas.height = px;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
    this.mesh = noRaycast(new Mesh(new PlaneGeometry(w, h), this.mat)) as Mesh;
    this.mesh.renderOrder = 5;
  }

  /** Redraw only when the content changes. */
  draw(key: string, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
    if (key === this.key) return;
    this.key = key;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // The 2D context keeps its state between paints: start from defaults.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    paint(ctx, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

// ---------------------------------------------------------------------------
// TrailField: all compact trails, the expanded lane and the sparks
// ---------------------------------------------------------------------------

const WHITE = new Color(1, 1, 1);
const MARKER_COLOR = new Color(1, 0.86, 0.55);

export class TrailField {
  /** Add this to the rig (it is in rig-local space). */
  readonly root = new Group();

  private readonly series: TrailSeries[];
  private readonly colors: Color[];
  private readonly sparkColors: Color[];
  private readonly samples: TrailSamples[];
  private readonly compact: Track[];
  private readonly compactRibbons: Ribbon[];
  private readonly compactGroups: Group[] = [];
  private readonly length: number;
  private readonly yearIndex: (year: number) => number;
  private readonly yearAt: (index: number) => number;

  // Per-slot animated state.
  private readonly pulse: Float32Array;
  private readonly pulseShown: Float32Array;
  private readonly focusShown: Float32Array;
  private readonly volNow: Float32Array;
  private readonly heads: Float64Array;
  private boost = 0;
  private boostTarget = 0;
  private now = 0;

  // Expanded lane.
  private readonly lane = new Group();
  private readonly laneTrack: Track;
  private readonly laneRibbon: Ribbon;
  private readonly laneHead: Sprite;
  private readonly laneBack: Mesh;
  private readonly laneFrame: LineSegments;
  private readonly laneStart: Line;
  private readonly header: TextPlane;
  private readonly footer: TextPlane;
  private readonly ticks: TextPlane[] = [];
  private readonly tickLines: LineSegments;
  private laneSlot = -1;
  private laneTarget = -1;
  private laneAlpha = 0;
  private zoomCenter = 0;
  private zoomHalf = 0.05;
  private zoomReady = false;
  private laneTitle = '';
  private laneStat = '';
  private laneNote = '';
  /** Lane text is redrawn at most a few times a second (canvas uploads cost). */
  private textTimer = 0;

  private readonly notes: SparkCloud;
  private readonly markers: SparkCloud;
  private readonly timeTicks: SparkCloud;
  private readonly v = new Vector3();
  private readonly c = new Color();

  constructor(
    series: TrailSeries[],
    colors: number[],
    angles: number[],
    yearIndex: (year: number) => number,
    yearAt: (index: number) => number,
  ) {
    this.series = series;
    this.yearIndex = yearIndex;
    this.yearAt = yearAt;
    const n = series.length;
    const maxPts = maxTrailPoints(TRAIL.windowWeeks);
    this.colors = colors.map((c) => new Color(c));
    this.sparkColors = this.colors.map((c) => c.clone().lerp(WHITE, 0.45));
    this.samples = series.map(() => createSamples(TRAIL.windowWeeks));
    this.compact = series.map(() => new Track(maxPts));
    this.pulse = new Float32Array(n);
    this.pulseShown = new Float32Array(n);
    this.focusShown = new Float32Array(n);
    this.volNow = new Float32Array(n);
    this.heads = new Float64Array(n);

    // Compact trails: as long as fits before the neighbor orb, so nine of
    // them read as one continuous stream of light across the arc.
    this.length = compactTrailLength(LAYOUT.radius, LAYOUT.arcDeg, n, LAYOUT.orbRadius, TRAIL.compactMargin);
    this.compactRibbons = this.colors.map((c, i) => {
      const g = new Group();
      const a = angles[i];
      const r = LAYOUT.radius + TRAIL.behindOrb;
      g.position.set(Math.sin(a) * r, LAYOUT.baseY, -Math.cos(a) * r);
      g.rotation.y = -a; // local +x runs along the arc to the right
      g.updateMatrix();
      // Fade exponent < 1: the older half stays readable, the far end still dissolves.
      const ribbon = new Ribbon(maxPts, c, 0.8, 0.22);
      g.add(ribbon.mesh);
      this.root.add(g);
      this.compactGroups.push(g);
      return ribbon;
    });

    // Expanded lane: centered, a little farther away than the orbs and above
    // most of them, below the caption board. Orbs stay in front of it.
    this.lane.position.set(0, LANE.y, -LANE.z);
    this.lane.updateMatrix();
    this.laneTrack = new Track(maxPts);
    this.laneRibbon = new Ribbon(maxPts, this.colors[0], 0.9, 0.3);
    const W = LANE.halfWidth;
    const H = LANE.halfHeight;
    this.laneBack = noRaycast(
      new Mesh(
        new PlaneGeometry(2 * W + 0.05, 2 * H + 0.1),
        new MeshBasicMaterial({ color: 0x03060d, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      ),
    ) as Mesh;
    this.laneBack.position.set(0, -0.004, -0.004);
    this.laneBack.renderOrder = 2;
    const frameGeo = new BufferGeometry();
    frameGeo.setAttribute('position', new Float32BufferAttribute([-W, H, 0, W, H, 0, -W, -H, 0, W, -H, 0], 3));
    this.laneFrame = noRaycast(
      new LineSegments(frameGeo, new LineBasicMaterial({ color: 0x8090b0, transparent: true, opacity: 0, depthWrite: false })),
    ) as LineSegments;
    const startGeo = new BufferGeometry();
    startGeo.setAttribute('position', new Float32BufferAttribute([-W, 0, 0, W, 0, 0], 3));
    this.laneStart = noRaycast(
      new Line(
        startGeo,
        new LineDashedMaterial({ color: 0xb8c4dc, dashSize: 0.008, gapSize: 0.008, transparent: true, opacity: 0, depthWrite: false }),
      ),
    ) as Line;
    this.laneStart.computeLineDistances();
    this.laneHead = noRaycast(
      new Sprite(
        new SpriteMaterial({ map: haloTexture(), color: this.colors[0].clone(), blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }),
      ),
    ) as Sprite;
    this.laneHead.scale.setScalar(0.035);
    this.laneHead.renderOrder = 4;
    this.header = new TextPlane(2 * W, 0.036, 72);
    this.header.mesh.position.set(0, H + 0.03, 0);
    this.footer = new TextPlane(2 * W, 0.024, 48);
    this.footer.mesh.position.set(0, -H - 0.026, 0);
    const tickGeo = new BufferGeometry();
    tickGeo.setAttribute('position', new BufferAttribute(new Float32Array(4 * 3), 3).setUsage(DynamicDrawUsage));
    this.tickLines = noRaycast(
      new LineSegments(tickGeo, new LineBasicMaterial({ color: 0x8090b0, transparent: true, opacity: 0, depthWrite: false })),
    ) as LineSegments;
    this.tickLines.frustumCulled = false;
    for (let k = 0; k < 2; k++) {
      const t = new TextPlane(0.05, 0.018, 36);
      t.mesh.position.y = -H + 0.012;
      this.ticks.push(t);
      this.lane.add(t.mesh);
    }
    this.lane.add(this.laneBack, this.laneFrame, this.tickLines, this.laneStart, this.laneRibbon.mesh, this.laneHead, this.header.mesh, this.footer.mesh);
    this.lane.visible = false;
    this.root.add(this.lane);

    this.notes = new SparkCloud(MAX_SPARKS, 0.012);
    this.markers = new SparkCloud(MAX_MARKERS, 0.026);
    const ticksPerTrail = Math.ceil(TRAIL.windowWeeks / TRAIL.tickWeeks) + 1;
    this.timeTicks = new SparkCloud(n * ticksPerTrail, 0.006);
    this.root.add(this.notes.points, this.markers.points, this.timeTicks.points);
  }

  /** Displayed height of trail i at its head: the orb sits exactly here. */
  headY(i: number): number {
    const t = this.compact[i];
    return t.count > 0 ? t.ys[t.count - 1] : 0;
  }

  /** Change across trail i's visible window (null if no data in it). */
  windowInfo(i: number): { fromT: number; pct: number } | null {
    return windowChange(this.samples[i]);
  }

  /** 0..1 how visible the solo lane is (the portal yields to it). */
  get laneVisibility(): number {
    const a = this.lane.visible ? this.laneAlpha : 0;
    return a * a * (3 - 2 * a);
  }

  get expandedSlot(): number {
    return this.laneTarget;
  }

  /** Open the lane for slot i (or -1 to close). Switching cross-fades. */
  setExpanded(i: number): void {
    this.laneTarget = i;
  }

  /** Lane text, set by the experience (which knows names, dates, today). */
  setLaneText(title: string, stat: string, note: string): void {
    this.laneTitle = title;
    this.laneStat = stat;
    this.laneNote = note;
  }

  /**
   * The playhead jumped: glide every trail (and orb) from what is shown now
   * to the new history, and drop sparks that belonged to the old time.
   * `orbHeights` are the orbs' displayed heights (dormant orbs rest at 0).
   */
  beginMorph(orbHeights: number[]): void {
    this.compact.forEach((tr, i) => {
      tr.morph.capture(tr.count, this.samples[i].age, tr.ys, tr.vis, orbHeights[i]);
    });
    if (this.laneSlot >= 0) {
      const s = this.samples[this.laneSlot];
      this.laneTrack.morph.capture(this.laneTrack.count, s.age, this.laneTrack.ys, this.laneTrack.vis);
    }
    this.notes.items.length = 0;
    this.markers.items.length = 0;
  }

  /** A note became audible on slot i: a soft glow at the head and a spark. */
  note(i: number, velocity: number): void {
    const s = this.series[i];
    if (this.heads[i] < s.first) return;
    this.pulse[i] = Math.max(this.pulse[i], 0.25 + 0.35 * velocity);
    this.notes.add({ slot: i, t: this.heads[i], born: this.now, shown: this.now, vel: velocity });
  }

  /** Pin a marker at a historical date on slot i's trail. */
  markEvent(i: number, index: number): void {
    this.markers.add({ slot: i, t: index, born: this.now, shown: -1, vel: 1 });
  }

  /** A major moment: every trail becomes clearer for a few seconds. */
  boostAll(): void {
    this.boostTarget = 1;
  }

  reset(): void {
    this.notes.items.length = 0;
    this.markers.items.length = 0;
    this.pulse.fill(0);
    this.focusShown.fill(0);
    this.boost = this.boostTarget = 0;
    this.laneTarget = -1;
  }

  update(dt: number, f: TrailFrame): void {
    this.now += dt;
    const W = TRAIL.windowWeeks;
    const n = this.series.length;

    // Smooth global and per-slot emphasis (rises take ~0.5 s: never a flash).
    this.boost += (this.boostTarget - this.boost) * Math.min(1, dt / 0.8);
    this.boostTarget = Math.max(0, this.boostTarget - dt / 6);
    const laneVisible = this.updateLaneFade(dt);

    for (let i = 0; i < n; i++) {
      const s = this.series[i];
      const head = f.heads[i];
      this.heads[i] = head;
      const smp = this.samples[i];
      const tr = this.compact[i];
      const tail = f.tails[i];
      sampleTrail(s.strength, s.first, head, W, smp, tail);
      const cnt = smp.count;
      tr.count = cnt;
      const vol = valueAt(s.vol, head);
      this.volNow[i] = head >= s.first ? vol : 0;

      for (let k = 0; k < cnt; k++) {
        tr.xs[k] = -this.length * smp.age[k];
        tr.ys[k] = strengthToHeight(smp.value[k]);
      }
      tr.morph.apply(cnt, smp.age, tr.ys, smp.valid, tr.vis, dt);

      // Emphasis.
      const fTarget = f.focus[i];
      this.focusShown[i] += (fTarget - this.focusShown[i]) * Math.min(1, dt / 0.5);
      const focus = this.focusShown[i];
      this.pulse[i] *= Math.exp(-dt / 0.6);
      // Slew-limited rise: the head glow swells rather than pops.
      this.pulseShown[i] += (this.pulse[i] - this.pulseShown[i]) * Math.min(1, dt / 0.1);
      const thick = 1 + 0.35 * focus;
      for (let k = 0; k < cnt; k++) {
        const v = valueAt(s.vol, smp.t[k]);
        tr.hw[k] = (TRAIL.compactHalfWidth + TRAIL.compactVolWidth * Math.tanh(v / 0.012)) * thick;
      }
      const ribbon = this.compactRibbons[i];
      ribbon.write(cnt, tr.xs, tr.ys, smp.age, tr.vis, tr.hw);
      const dim = i === this.laneSlot ? 1 : 1 - 0.65 * laneVisible;
      const busy = Math.tanh(this.volNow[i] / 0.012);
      const base = (0.5 + 0.35 * busy) * (1 + 0.3 * f.turbulence) + 0.55 * focus + 0.3 * this.boost;
      const selected = i === this.laneSlot ? 0.35 * laneVisible : 0;
      ribbon.mat.uniforms.uIntensity.value = Math.min(1.6, base + selected) * dim;
      ribbon.mat.uniforms.uHead.value = this.pulseShown[i] * dim;
    }

    this.updateLane(dt, laneVisible);
    this.updateSparks(laneVisible);
    this.updateTimeTicks(laneVisible);
  }

  /**
   * Faint beads pinned to fixed weeks (every TRAIL.tickWeeks): they ride the
   * ribbon at the speed of time, so the flow is visible even when a rate is
   * flat. They are time marks only; they carry no invented values.
   */
  private updateTimeTicks(laneVisible: number): void {
    const W = TRAIL.windowWeeks;
    const step = TRAIL.tickWeeks;
    const cloud = this.timeTicks;
    cloud.begin();
    for (let i = 0; i < this.series.length; i++) {
      const head = this.heads[i];
      const first = this.series[i].first;
      const tr = this.compact[i];
      if (head < first || tr.count === 0) continue;
      const dim = i === this.laneSlot ? 1 : 1 - 0.65 * laneVisible;
      for (let t = Math.ceil((head - W) / step) * step; t <= head; t += step) {
        if (t < first) continue;
        const age = (head - t) / W;
        const y = interpByAge(tr.count, this.samples[i].age, tr.ys, age);
        const vis = interpByAge(tr.count, this.samples[i].age, tr.vis, age);
        // Fade in near the orb and out at the far end: no popping.
        const a = 0.55 * Math.min(1, age * 8) * Math.pow(1 - age, 1.2) * vis * dim;
        this.v.set(-this.length * age, y, 0.002).applyMatrix4(this.compactGroups[i].matrix);
        cloud.put(this.v, this.sparkColors[i], a);
      }
    }
    cloud.end();
  }

  /** Lane opacity: fades out before switching currency, then back in. */
  private updateLaneFade(dt: number): number {
    if (this.laneSlot !== this.laneTarget) {
      this.laneAlpha = Math.max(0, this.laneAlpha - dt / 0.25);
      if (this.laneAlpha === 0) {
        this.laneSlot = this.laneTarget;
        this.zoomReady = false;
        this.textTimer = 0;
        if (this.laneSlot >= 0) {
          (this.laneRibbon.mat.uniforms.uColor.value as Color).copy(this.colors[this.laneSlot]);
          (this.laneHead.material as SpriteMaterial).color.copy(this.colors[this.laneSlot]);
          this.laneTrack.morph.blend = 0;
        }
      }
    } else if (this.laneSlot >= 0) {
      this.laneAlpha = Math.min(1, this.laneAlpha + dt / 0.5);
    }
    this.lane.visible = this.laneSlot >= 0 && this.laneAlpha > 0;
    const a = this.laneAlpha;
    return a * a * (3 - 2 * a);
  }

  private updateLane(dt: number, vis: number): void {
    if (!this.lane.visible) return;
    const i = this.laneSlot;
    const s = this.series[i];
    const smp = this.samples[i];
    const tr = this.laneTrack;
    const W = LANE.halfWidth;
    const H = LANE.halfHeight;
    const cnt = smp.count;
    tr.count = cnt;

    // Auto-zoom: fit the window's range, smoothed so the scale glides.
    const z = zoomTarget(smp, LANE.minHalfRange);
    if (z) {
      if (!this.zoomReady) {
        this.zoomCenter = z.center;
        this.zoomHalf = z.half;
        this.zoomReady = true;
      } else {
        const k = Math.min(1, dt / LANE.zoomTau);
        this.zoomCenter += (z.center - this.zoomCenter) * k;
        this.zoomHalf = Math.exp(Math.log(this.zoomHalf) + (Math.log(z.half) - Math.log(this.zoomHalf)) * k);
      }
    }
    const scale = H / this.zoomHalf;
    for (let k = 0; k < cnt; k++) {
      tr.xs[k] = W - 2 * W * smp.age[k];
      tr.ys[k] = (smp.value[k] - this.zoomCenter) * scale;
      const v = valueAt(s.vol, smp.t[k]);
      tr.hw[k] = LANE.halfWidthBase + LANE.halfWidthVol * Math.tanh(v / 0.012);
    }
    tr.morph.apply(cnt, smp.age, tr.ys, smp.valid, tr.vis, dt);
    for (let k = 0; k < cnt; k++) tr.ys[k] = Math.max(-H * 1.25, Math.min(H * 1.25, tr.ys[k]));
    this.laneRibbon.write(cnt, tr.xs, tr.ys, smp.age, tr.vis, tr.hw);
    this.laneRibbon.mat.uniforms.uIntensity.value = 1.05 * vis;
    this.laneRibbon.mat.uniforms.uHead.value = this.pulseShown[i] * vis;

    // Head marker, frame, and the dashed "where it started" line.
    const alive = cnt > 0 && smp.valid[cnt - 1] === 1;
    this.laneHead.position.set(tr.xs[cnt - 1], tr.ys[cnt - 1], 0.002);
    (this.laneHead.material as SpriteMaterial).opacity = alive ? (0.75 + 0.25 * this.pulseShown[i]) * vis : 0;
    (this.laneBack.material as MeshBasicMaterial).opacity = 0.5 * vis;
    (this.laneFrame.material as LineBasicMaterial).opacity = 0.18 * vis;
    let k0 = -1;
    for (let k = 0; k < cnt; k++) {
      if (smp.valid[k]) {
        k0 = k;
        break;
      }
    }
    (this.laneStart.material as LineDashedMaterial).opacity = k0 >= 0 ? 0.35 * vis : 0;
    if (k0 >= 0) this.laneStart.position.y = tr.ys[k0];

    // Year ticks scroll with the data (time stays readable while zoomed).
    const head = this.heads[i];
    const tickPos = this.tickLines.geometry.getAttribute('position') as BufferAttribute;
    const arr = tickPos.array as Float32Array;
    let used = 0;
    const y1 = this.yearAt(head);
    for (let y = y1; y > y1 - 3 && used < 2; y--) {
      const t = this.yearIndex(y);
      const age = (head - t) / TRAIL.windowWeeks;
      if (age < 0 || age > 0.97 || t < s.first) continue;
      const x = W - 2 * W * age;
      arr.set([x, -H, 0, x, H, 0], used * 6);
      const label = this.ticks[used];
      label.mesh.position.x = x + 0.028;
      label.mat.opacity = 0.75 * vis * Math.min(1, (1 - age) * 3);
      label.draw(String(y), (ctx, w, h) => {
        ctx.font = `${Math.round(h * 0.8)}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#c9d3e8';
        ctx.fillText(String(y), 2, h / 2);
      });
      used++;
    }
    for (let k = used; k < 2; k++) {
      arr.fill(0, k * 6, k * 6 + 6);
      this.ticks[k].mat.opacity = 0;
    }
    tickPos.needsUpdate = true;
    this.tickLines.geometry.setDrawRange(0, used * 2);
    (this.tickLines.material as LineBasicMaterial).opacity = 0.22 * vis;

    // Text: name and window change on top; scale note below (auto-zoom is
    // always labelled, with its range, so it is never mistaken for the
    // shared scale of the compact trails).
    this.header.mat.opacity = vis;
    this.footer.mat.opacity = 0.9 * vis;
    this.textTimer -= dt;
    if (this.textTimer > 0) return;
    this.textTimer = 0.25;
    const color = '#' + this.colors[i].getHexString();
    const span = (Math.exp(this.zoomHalf) - 1) * 100;
    const zoomText = `Auto-zoom: full height = +/-${span < 10 ? span.toFixed(1) : span.toFixed(0)}%`;
    this.header.draw(`${this.laneTitle}|${this.laneStat}|${color}`, (ctx, w, h) => {
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(h * 0.62)}px system-ui, sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(this.laneTitle, 4, h / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.laneStat, w - 4, h / 2);
    });
    this.footer.draw(`${this.laneNote}|${zoomText}`, (ctx, w, h) => {
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(h * 0.62)}px system-ui, sans-serif`;
      ctx.fillStyle = '#d6deee';
      ctx.fillText(this.laneNote, 4, h / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#9fb0cc';
      ctx.fillText(zoomText, w - 4, h / 2);
    });
  }

  private updateSparks(laneVisible: number): void {
    const W = TRAIL.windowWeeks;
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
        if (age < 0) continue; // a marker for a date the head has not reached yet
        if (sp.shown < 0) sp.shown = this.now;
        const fadeIn = Math.min(1, (this.now - sp.shown) / (isMarker ? 0.5 : 0.15));
        const along = Math.pow(1 - age, isMarker ? 0.7 : 1.2);
        const a = isMarker ? 0.85 * fadeIn * along : sp.vel * 0.8 * fadeIn * along * Math.exp(-life / 1.8);
        const color = isMarker ? MARKER_COLOR : this.sparkColors[sp.slot];

        // On the compact trail (exactly on the displayed ribbon).
        const tr = this.compact[sp.slot];
        const y = interpByAge(tr.count, this.samples[sp.slot].age, tr.ys, age);
        const dim = sp.slot === this.laneSlot ? 1 : 1 - 0.65 * laneVisible;
        this.v.set(-this.length * age, y, 0.002).applyMatrix4(this.compactGroups[sp.slot].matrix);
        cloud.put(this.v, color, a * dim);

        // And on the lane, if this currency is expanded.
        if (laneVisible > 0.01 && sp.slot === this.laneSlot) {
          const lt = this.laneTrack;
          const ly = interpByAge(lt.count, this.samples[sp.slot].age, lt.ys, age);
          this.v.set(LANE.halfWidth - 2 * LANE.halfWidth * age, ly, 0.003).applyMatrix4(this.lane.matrix);
          cloud.put(this.v, color, a * laneVisible);
        }
      }
      cloud.end();
    }
  }

  dispose(): void {
    this.compactRibbons.forEach((r) => r.dispose());
    this.laneRibbon.dispose();
    this.notes.dispose();
    this.markers.dispose();
    this.timeTicks.dispose();
    this.header.dispose();
    this.footer.dispose();
    this.ticks.forEach((t) => t.dispose());
    for (const o of [this.laneBack, this.laneFrame, this.laneStart, this.tickLines]) {
      o.geometry.dispose();
      (o.material as MeshBasicMaterial).dispose();
    }
    (this.laneHead.material as SpriteMaterial).dispose();
    this.root.removeFromParent();
  }
}
