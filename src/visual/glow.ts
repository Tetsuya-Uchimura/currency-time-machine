/**
 * Shared glowing primitives for the chart and the map (Quest friendly: no
 * post-processing, one small dynamic mesh per line, additive blending).
 *
 *   Ribbon      a line drawn as a triangle strip with a glowing core; newer
 *               parts are brighter, the head can glow (notes)
 *   Track       reusable per-line buffers (x, y, visibility, half-width)
 *   SparkCloud  small lights pinned to a moment in time (notes, events)
 *   TextPlane   a canvas text plane that is redrawn only when its text changes
 *
 * Nothing here is interactive: raycasting is disabled so pinches reach the
 * markers and panels.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  AdditiveBlending,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  PlaneGeometry,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from '@iwsdk/core';
import { TrailMorph } from './trail-sampling.js';

export const noRaycast = <T extends Object3D>(o: T): T => {
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

export class Ribbon {
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
    this.mesh = noRaycast(new Mesh(this.geo, this.mat));
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

export class Track {
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


export interface Spark {
  slot: number;
  /** Week index the spark belongs to. */
  t: number;
  /** Real time it was created (s). */
  born: number;
  /** Real time it first became visible (markers wait for the head). */
  shown: number;
  vel: number;
}

export class SparkCloud {
  readonly points: Points;
  private readonly geo = new BufferGeometry();
  private readonly pos: BufferAttribute;
  private readonly col: BufferAttribute;
  readonly items: Spark[] = [];
  n = 0;

  private readonly capacity: number;

  constructor(capacity: number, size: number) {
    this.capacity = capacity;
    const cap = capacity * 2; // room for a second copy of each item
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
    this.points = noRaycast(new Points(this.geo, mat));
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
// Small canvas text plane (labels, axis ticks, headers)
// ---------------------------------------------------------------------------

export class TextPlane {
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
    this.mesh = noRaycast(new Mesh(new PlaneGeometry(w, h), this.mat));
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

/** A dynamic set of line segments (grid, ticks, leaders), rewritten each frame. */
export class Segments {
  readonly lines: LineSegments;
  private readonly pos: BufferAttribute;
  private n = 0;
  constructor(max: number, color: number, opacity: number) {
    const geo = new BufferGeometry();
    this.pos = new BufferAttribute(new Float32Array(max * 6), 3).setUsage(DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setDrawRange(0, 0);
    this.lines = noRaycast(
      new LineSegments(geo, new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false })),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 2;
  }
  begin(): void {
    this.n = 0;
  }
  add(x0: number, y0: number, x1: number, y1: number, z = 0.001): void {
    const a = this.pos.array as Float32Array;
    if ((this.n + 1) * 6 > a.length) return;
    a.set([x0, y0, z, x1, y1, z], this.n * 6);
    this.n++;
  }
  end(): void {
    this.pos.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, this.n * 2);
  }
  get material(): LineBasicMaterial {
    return this.lines.material as LineBasicMaterial;
  }
  dispose(): void {
    this.lines.geometry.dispose();
    this.material.dispose();
  }
}

let haloTex: CanvasTexture | null = null;
/** Shared soft round glow texture (halos, sparks, map dots). */
export function haloTexture(): CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  haloTex = new CanvasTexture(c);
  return haloTex;
}
