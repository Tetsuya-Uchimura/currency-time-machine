/**
 * Historical Portals: a "window onto the era" that takes over the top band
 * (Historical Events) when one of four major moments approaches. It answers
 * three questions at once, while the chart and the map below react:
 *
 *   Where           photographs of the city at the time (one across the band,
 *                   dimmed, and a clear one floating in front of it on the
 *                   left), with the city, country and period in the title;
 *   Who & Why       portrait cards of the main decision makers (verified
 *                   offices; pinch the band for everyone's role, the
 *                   policies and the sources);
 *   What happened   the actual date, the currencies involved and a live
 *                   readout: the rate on the decision's date and at the
 *                   playhead, updated as time flows on.
 *
 * Layout in the band (left to right): floating photo, title plate, three
 * portrait cards. The band is the farthest of the three (see config BANDS),
 * so it never hides the chart or the map; the pinch card comes forward.
 *
 * If no verified photographs are available (or they fail to load), the window
 * shows the code-generated city impression instead, labelled as such.
 *
 * Animation (all eased, nothing flashes): the outline draws itself from the
 * top, the city fades in, then the title, the floating photo and the people.
 * On the event date the scene brightens a little and the motes spread.
 * Leaving, color and brightness drain first, then the outline.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CustomBlending,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  PlaneGeometry,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from '@iwsdk/core';
import { BANDS } from '../config.js';
import type { HistoryContent, HistoryEventContent, HistoryPhoto } from '../data/history-content.js';
import { IMPRESSION_NOTE, sceneStyle, type PortalScene } from '../data/portals.js';
import { paintCity } from './city-painter.js';
import { haloTexture } from './glow.js';

export interface PortalView {
  /** Scene index from the director (-1: none). */
  index: number;
  appear: number;
  highlight: number;
  out: number;
  /** False while paused: motes freeze with time. */
  flowing: boolean;
  /** 0..1: something nearer has priority (dims the window, hides its texts). */
  laneVisible: number;
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

const LAYER_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/** Scene layer: cover-fit crop, saturation/brightness control and soft edges. */
const LAYER_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uSat;
  uniform float uBright;
  uniform vec2 uEdge;
  uniform vec2 uRepeat;
  uniform vec2 uOffset;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(uMap, vUv * uRepeat + uOffset);
    float g = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    c.rgb = mix(vec3(g), c.rgb, uSat) * uBright;
    vec2 e = min(vUv, 1.0 - vUv);
    float m = smoothstep(0.0, uEdge.x, e.x) * smoothstep(0.0, uEdge.y, e.y);
    gl_FragColor = vec4(c.rgb, c.a * uOpacity * m);
    #include <colorspace_fragment>
  }`;

/** Glowing rounded outline that draws itself from the top center. */
const FRAME_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec2 uSize;
  uniform vec2 uHalf;
  uniform float uReveal;
  uniform float uIntensity;
  varying vec2 vUv;
  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    float d = abs(sdRoundRect(p, uHalf, 0.02));
    float line = exp(-pow(d / 0.0028, 2.0));
    float halo = exp(-d / 0.011) * 0.22;
    float ang = abs(atan(p.x, p.y)) / 3.14159265;
    float shown = smoothstep(uReveal + 0.04, uReveal - 0.04, ang);
    float a = (line + halo) * shown * uIntensity;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), line * 0.35) * a, 1.0);
    #include <colorspace_fragment>
  }`;

type SceneAssets =
  | { kind: 'impression'; layers: Texture[] }
  | { kind: 'photo'; back: Texture; backAspect: number; inset: Texture | null; insetAspect: number; credits: string };

interface People {
  texture: CanvasTexture | null;
  count: number;
}

const MOTES = 90;
const MAX_CARDS = 3;
/** Sizes in the band (meters): title plate and the three portrait cards. */
const TITLE_W = 0.52;
const CARDS_W = 0.6;
const CARD_H = 0.42;
const CARDS_PX = 1440;
/** The floating photo: at most this tall and this wide. */
const INSET_H = 0.4;
const INSET_MAX_W = 0.54;

function layerMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uOpacity: { value: 0 },
      uSat: { value: 1 },
      uBright: { value: 1 },
      uEdge: { value: [0.06, 0.1] },
      uRepeat: { value: [1, 1] },
      uOffset: { value: [0, 0] },
    },
    vertexShader: LAYER_VERT,
    fragmentShader: LAYER_FRAG,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}

function frameMaterial(w: number, h: number, pad: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(0xffffff) },
      uSize: { value: [w + pad, h + pad] },
      uHalf: { value: [w / 2, h / 2] },
      uReveal: { value: 0 },
      uIntensity: { value: 0 },
    },
    vertexShader: LAYER_VERT,
    fragmentShader: FRAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    toneMapped: false,
  });
}

/** Cover-fit: crop a texture of `aspect` (w/h) to fill a plane of `target`. */
function coverFit(mat: ShaderMaterial, aspect: number, target: number): void {
  if (aspect > target) {
    const r = target / aspect;
    mat.uniforms.uRepeat.value = [r, 1];
    mat.uniforms.uOffset.value = [(1 - r) / 2, 0];
  } else {
    const r = aspect / target;
    mat.uniforms.uRepeat.value = [1, r];
    mat.uniforms.uOffset.value = [0, (1 - r) / 2];
  }
}

/** A plane showing a canvas (title, people, details). */
class CanvasPlane {
  readonly mesh: Mesh;
  readonly mat: MeshBasicMaterial;
  readonly canvas = document.createElement('canvas');
  readonly tex: CanvasTexture;
  key = '';

  constructor(w: number, h: number, pxW: number) {
    this.canvas.width = pxW;
    this.canvas.height = Math.round((pxW * h) / w);
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
    this.mesh = new Mesh(new PlaneGeometry(w, h), this.mat);
    this.mesh.raycast = () => {};
    this.mesh.visible = false;
  }

  /** Redraw only when `key` changes. */
  draw(key: string, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
    if (key === this.key) return;
    this.key = key;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    paint(ctx, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
  }

  setOpacity(o: number): void {
    this.mat.opacity = o;
    this.mesh.visible = o > 0.003;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

export class HistoricalPortals {
  /** Add to the rig (rig-local space). */
  readonly root = new Group();
  /** Invisible pinch target covering the window (raycast only while shown). */
  readonly hit: Mesh;

  private readonly scenes: PortalScene[];
  private readonly content: HistoryContent | null;
  private readonly initTexture: (t: Texture) => void;
  private readonly assets = new Map<number, SceneAssets>();
  private readonly people = new Map<number, People>();
  private readonly pending = new Set<number>();
  private readonly layerMeshes: Mesh[] = [];
  private readonly layerMats: ShaderMaterial[] = [];
  private readonly frameMat: ShaderMaterial;
  private readonly frame: Mesh;
  private readonly inset: Mesh;
  private readonly insetMat: ShaderMaterial;
  private readonly insetFrameMat: ShaderMaterial;
  private readonly insetFrame: Mesh;
  private readonly title: CanvasPlane;
  private readonly cards: CanvasPlane;
  private readonly detail: CanvasPlane;
  private readonly motes: Points;
  private readonly moteMat: PointsMaterial;
  private readonly motePos: BufferAttribute;
  private readonly moteSeed: Float32Array;
  private readonly accent = new Color();
  private displayed = -1;
  private applied = false;
  private switching = 1; // 1 = fully shown, falls to 0 while switching scenes
  private details = false;
  private detailFade = 0;
  private readout: string[] = [];
  private time = 0;
  private visible = 0;
  /** Last envelope of the displayed window, held while it is being switched out. */
  private readonly held = { appear: 0, out: 0, hl: 0 };

  /** CSS color per slot id (currency codes in the title). */
  private readonly slotCss: Record<string, string>;

  constructor(
    scenes: PortalScene[],
    content: HistoryContent | null,
    initTexture: (t: Texture) => void = () => {},
    slotCss: Record<string, string> = {},
  ) {
    this.scenes = scenes;
    this.content = content;
    this.initTexture = initTexture;
    this.slotCss = slotCss;
    const W = BANDS.events.width;
    const H = BANDS.events.height;

    // Scene layers, back to front, each a little larger as it goes deeper so
    // they still fill the window from the seat. (A photograph uses the first.)
    [-0.12, -0.06, -0.018].forEach((z, k) => {
      const mat = layerMaterial();
      const s = 1 + -z / BANDS.events.z;
      const mesh = new Mesh(new PlaneGeometry(W * s, H * s), mat);
      mesh.position.z = z;
      mesh.renderOrder = -7 + k;
      mesh.raycast = () => {};
      mesh.visible = false;
      this.layerMeshes.push(mesh);
      this.layerMats.push(mat);
      this.root.add(mesh);
    });

    this.frameMat = frameMaterial(W, H, 0.1);
    this.frame = new Mesh(new PlaneGeometry(W + 0.1, H + 0.1), this.frameMat);
    this.frame.renderOrder = -3;
    this.frame.raycast = () => {};
    this.frame.visible = false;
    this.root.add(this.frame);

    // A second photograph floating in front of the window (real depth).
    this.insetMat = layerMaterial();
    this.insetMat.uniforms.uEdge.value = [0.015, 0.02];
    this.inset = new Mesh(new PlaneGeometry(1, 1), this.insetMat);
    this.inset.position.set(-W / 2 + 0.31, 0, 0.05);
    this.inset.renderOrder = -2;
    this.inset.raycast = () => {};
    this.inset.visible = false;
    this.insetFrameMat = frameMaterial(1, 1, 0.06);
    this.insetFrame = new Mesh(new PlaneGeometry(1, 1), this.insetFrameMat);
    this.insetFrame.position.copy(this.inset.position).setZ(0.081);
    this.insetFrame.renderOrder = -1;
    this.insetFrame.raycast = () => {};
    this.insetFrame.visible = false;
    this.root.add(this.inset, this.insetFrame);

    // Title plate (middle) and portrait cards (right), in front of the backdrop.
    this.title = new CanvasPlane(TITLE_W, CARD_H, 1200);
    this.title.mesh.position.set(-0.03, 0, 0.03);
    this.cards = new CanvasPlane(CARDS_W, CARD_H, CARDS_PX);
    this.cards.mesh.position.set(W / 2 - 0.04 - CARDS_W / 2, 0, 0.03);
    // Details (pinch): comes forward and down to eye level (over the chart,
    // while time almost stops), large enough to read comfortably.
    this.detail = new CanvasPlane(1.34, 0.74, 1700);
    this.detail.mesh.position.set(0, -0.4, 0.32);
    for (const p of [this.title, this.cards]) p.mesh.renderOrder = 0;
    this.detail.mesh.renderOrder = 20; // over the chart and map below it while open
    this.root.add(this.title.mesh, this.cards.mesh, this.detail.mesh);

    // Motes drifting slowly in front of the window.
    this.moteSeed = new Float32Array(MOTES * 4);
    for (let i = 0; i < this.moteSeed.length; i++) this.moteSeed[i] = Math.random();
    const geo = new BufferGeometry();
    this.motePos = new BufferAttribute(new Float32Array(MOTES * 3), 3).setUsage(DynamicDrawUsage);
    geo.setAttribute('position', this.motePos);
    this.moteMat = new PointsMaterial({
      size: 0.009,
      map: haloTexture(),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0,
      toneMapped: false,
    });
    this.motes = new Points(geo, this.moteMat);
    this.motes.frustumCulled = false;
    this.motes.raycast = () => {};
    this.motes.visible = false;
    this.root.add(this.motes);

    // Pinch target: invisible, and only hit-testable while a window is shown.
    this.hit = new Mesh(
      new PlaneGeometry(W, H),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    this.hit.position.z = 0.02;
    this.hit.name = 'historical-portal';
    this.setHittable(false);
  }

  /** 0..1 how much of the band the window holds (the era view yields to it). */
  get visibility(): number {
    return this.visible;
  }

  /** Is a window on screen (for input and diagnostics)? */
  get shown(): boolean {
    return this.visible > 0.3;
  }

  get showingDetails(): boolean {
    return this.details;
  }

  /** Content of scene i (people, photos, policies), if any. */
  contentOf(i: number): HistoryEventContent | undefined {
    return i >= 0 ? this.content?.get(this.scenes[i].eventId) : undefined;
  }

  get displayedIndex(): number {
    return this.displayed;
  }

  /** Dev diagnostics: what is on screen. */
  get debug(): string {
    const a = this.assets.get(this.displayed);
    return `${this.displayed}:${this.visible.toFixed(2)}/${a?.kind ?? '-'}/title${this.title.mat.opacity.toFixed(2)}/details${this.details ? 1 : 0}`;
  }

  /** Pinch on the window: the full card (people, policies, sources), then back. */
  toggleDetails(): void {
    if (this.displayed < 0 || !this.shown) return;
    this.details = !this.details;
  }

  hideDetails(): void {
    this.details = false;
  }

  /** "What happened" lines for the displayed window (set a few times a second). */
  setReadout(lines: string[]): void {
    this.readout = lines;
  }

  /** Prepare scene i's textures in idle time (no frame hitch). */
  prefetch(i: number): void {
    if (i < 0 || this.assets.has(i) || this.pending.has(i)) return;
    this.pending.add(i);
    const run = () => void this.build(i).finally(() => this.pending.delete(i));
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: object) => number }).requestIdleCallback;
    if (idle) idle(run, { timeout: 1500 });
    else window.setTimeout(run, 0);
  }

  private async build(i: number): Promise<void> {
    if (this.assets.has(i)) return;
    const c = this.contentOf(i);
    const photos = c?.portal?.photos ?? [];
    let assets: SceneAssets | null = null;
    if (photos.length) {
      const [back, inset] = await Promise.all([loadTexture(photos[0].src), photos[1] ? loadTexture(photos[1].src) : null]);
      if (back) {
        this.initTexture(back);
        if (inset) this.initTexture(inset);
        assets = {
          kind: 'photo',
          back,
          backAspect: photos[0].width / photos[0].height,
          inset,
          insetAspect: photos[1] ? photos[1].width / photos[1].height : 1.5,
          credits: photoCredits(photos.slice(0, inset ? 2 : 1)),
        };
      }
    }
    if (!assets) assets = this.paint(i); // no verified photo, or it failed to load
    this.assets.set(i, assets);
    if (c?.people.length && !this.people.has(i)) this.people.set(i, await buildCards(c, this.initTexture));
  }

  private paint(i: number): SceneAssets {
    const layers = paintCity(sceneStyle(this.scenes[i]));
    return {
      kind: 'impression',
      layers: [layers.sky, layers.city, layers.front].map((cv) => {
        const t = new CanvasTexture(cv);
        t.colorSpace = SRGBColorSpace;
        this.initTexture(t);
        return t;
      }),
    };
  }

  private release(i: number): void {
    const a = this.assets.get(i);
    if (a?.kind === 'impression') a.layers.forEach((t) => t.dispose());
    if (a?.kind === 'photo') {
      a.back.dispose();
      a.inset?.dispose();
    }
    this.assets.delete(i);
    this.people.get(i)?.texture?.dispose();
    this.people.delete(i);
  }

  private show(i: number): void {
    this.displayed = i;
    this.details = false;
    this.detailFade = 0;
    this.applied = false;
    this.title.key = this.cards.key = this.detail.key = '';
    this.readout = [];
    if (i < 0) return;
    this.accent.set(this.scenes[i].accent);
    for (const m of [this.frameMat, this.insetFrameMat]) (m.uniforms.uColor.value as Color).copy(this.accent);
    this.moteMat.color.copy(this.accent);
    // Keep only this window's textures.
    for (const k of [...this.assets.keys()]) if (k !== i) this.release(k);
    if (!this.assets.has(i)) this.prefetch(i); // jumped straight in: load now
  }

  /** Put the scene's textures on the meshes once they are ready. */
  private apply(i: number): void {
    const a = this.assets.get(i);
    if (!a) return;
    const W = BANDS.events.width;
    const H = BANDS.events.height;
    if (a.kind === 'impression') {
      this.layerMats.forEach((m, k) => {
        m.uniforms.uMap.value = a.layers[k];
        m.uniforms.uRepeat.value = [1, 1];
        m.uniforms.uOffset.value = [0, 0];
      });
      this.insetMat.uniforms.uMap.value = null;
    } else {
      this.layerMats.forEach((m, k) => (m.uniforms.uMap.value = k === 0 ? a.back : null));
      coverFit(this.layerMats[0], a.backAspect, W / H);
      this.insetMat.uniforms.uMap.value = a.inset;
      if (a.inset) {
        const w = Math.min(INSET_MAX_W, INSET_H * a.insetAspect);
        const h = w / a.insetAspect;
        this.inset.position.x = -W / 2 + 0.04 + w / 2;
        this.insetFrame.position.x = this.inset.position.x;
        this.inset.scale.set(w, h, 1);
        this.insetFrame.scale.set(w + 0.06, h + 0.06, 1);
        this.insetFrameMat.uniforms.uSize.value = [w + 0.06, h + 0.06];
        this.insetFrameMat.uniforms.uHalf.value = [w / 2, h / 2];
      }
    }
    this.cards.key = '';
    this.applied = true;
  }

  update(dt: number, v: PortalView): void {
    // Switching scenes (or closing after a jump): a quick, smooth fade first.
    if (v.index !== this.displayed) {
      if (this.displayed >= 0 && this.switching > 0) {
        this.switching = Math.max(0, this.switching - dt / 0.45);
      } else {
        if (this.displayed >= 0 && v.index < 0) this.release(this.displayed);
        this.show(v.index);
        this.switching = 1;
      }
    }
    const i = this.displayed;
    const on = i >= 0;
    if (on && !this.applied && this.assets.has(i)) this.apply(i);
    if (on && v.index === i) {
      this.held.appear = v.appear;
      this.held.out = v.out;
      this.held.hl = v.highlight;
    }
    // While switching out, keep the last look and fade it (never pop back).
    const q = v.index === i ? 1 : smooth(this.switching);
    const appear = on ? this.held.appear : 0;
    const out = on ? this.held.out : 0;
    const hl = on ? this.held.hl : 0;
    const laneDim = 1 - 0.55 * v.laneVisible;
    const textDim = 1 - v.laneVisible; // the lane's texts win

    const frameIn = smooth(appear / 0.4);
    const imageIn = smooth((appear - 0.2) / 0.7) * (this.applied ? 1 : 0);
    const titleIn = smooth((appear - 0.5) / 0.4);
    const insetIn = smooth((appear - 0.4) / 0.5) * (this.applied ? 1 : 0);
    const cardsIn = smooth((appear - 0.65) / 0.35);
    const imageOut = smooth(out / 0.75);
    const frameOut = smooth((out - 0.35) / 0.65);
    const textOut = 1 - smooth(out / 0.5);

    const a = this.assets.get(i);
    const photo = a?.kind === 'photo';
    // The band-wide photo stays a backdrop behind the plates.
    const imageOpacity = (photo ? 0.7 : 0.85) * imageIn * (1 - imageOut) * q * laneDim;
    this.visible = on ? Math.max(imageOpacity, frameIn * (1 - frameOut) * q) : 0;
    const sat = 1 - 0.85 * smooth(out / 0.6);
    const bright = (photo ? 0.55 : 1.1) + 0.25 * hl - 0.5 * smooth(out / 0.8);
    this.layerMats.forEach((m) => {
      m.uniforms.uOpacity.value = imageOpacity;
      m.uniforms.uSat.value = sat;
      m.uniforms.uBright.value = bright;
    });
    this.insetMat.uniforms.uOpacity.value = (photo && a.inset ? 0.97 : 0) * insetIn * (1 - imageOut) * q * laneDim;
    this.insetMat.uniforms.uSat.value = sat;
    this.insetMat.uniforms.uBright.value = 0.92 + 0.15 * hl - 0.6 * smooth(out / 0.8);
    this.frameMat.uniforms.uReveal.value = frameIn;
    this.frameMat.uniforms.uIntensity.value = frameIn * (1 - frameOut) * q * laneDim * (0.75 + 0.6 * hl);
    this.insetFrameMat.uniforms.uReveal.value = insetIn;
    this.insetFrameMat.uniforms.uIntensity.value = photo && a.inset ? insetIn * (1 - frameOut) * q * laneDim * 0.55 : 0;

    const visible = on && this.visible > 0.002;
    this.frame.visible = visible;
    this.motes.visible = visible;
    this.layerMeshes.forEach((m, k) => (m.visible = visible && !!this.layerMats[k].uniforms.uMap.value));
    this.inset.visible = this.insetFrame.visible = visible && !!this.insetMat.uniforms.uMap.value;
    this.setHittable(visible && this.shown);

    this.detailFade += ((this.details ? 1 : 0) - this.detailFade) * Math.min(1, dt / 0.25);
    const people = this.people.get(i);
    this.title.setOpacity(visible ? titleIn * textOut * q * textDim : 0);
    this.cards.setOpacity(visible && people?.texture ? cardsIn * textOut * q * textDim * (1 - 0.6 * this.detailFade) : 0);
    this.detail.setOpacity(visible ? this.detailFade * textOut * q * textDim : 0);
    if (!visible) return;

    if (v.flowing) this.time += dt; // motes freeze while paused, like time
    this.updateMotes(hl, imageIn * (1 - imageOut) * q);
    this.drawTitle(i);
    if (people?.texture && this.cards.mat.map !== people.texture) {
      this.cards.mat.map = people.texture;
      this.cards.mat.needsUpdate = true;
    }
    if (this.detailFade > 0.01) this.drawDetail(i);
  }

  private updateMotes(hl: number, vis: number): void {
    const W = BANDS.events.width;
    const H = BANDS.events.height;
    const p = this.motePos.array as Float32Array;
    const s = this.moteSeed;
    const spread = 1 + 0.18 * hl;
    for (let k = 0; k < MOTES; k++) {
      const rise = (s[4 * k + 1] + this.time * (0.008 + 0.02 * s[4 * k + 2])) % 1;
      const sway = Math.sin(this.time * 0.3 + s[4 * k + 3] * 6.28) * 0.01;
      p[3 * k] = ((s[4 * k] - 0.5) * W * 0.96 + sway) * spread;
      p[3 * k + 1] = (rise - 0.5) * H * 0.92 * spread;
      p[3 * k + 2] = 0.03 + s[4 * k + 3] * 0.22;
    }
    this.motePos.needsUpdate = true;
    this.moteMat.opacity = vis * (0.35 + 0.45 * hl);
  }

  /** Where (city, country, period), the moment and its date, the currencies, what happened, and credits. */
  private drawTitle(i: number): void {
    const scene = this.scenes[i];
    const c = this.contentOf(i);
    const a = this.assets.get(i);
    const credits = a?.kind === 'photo' ? a.credits : IMPRESSION_NOTE;
    const key = `${i}|${credits}|${this.readout.join('|')}`;
    const accent = '#' + this.accent.getHexString();
    this.title.draw(key, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(4,7,14,0.82)';
      roundRect(ctx, 0, 0, w, h, 26);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(22, 30, 7, h - 60);
      const x = 52;
      const maxW = w - x - 30;
      const city = (c?.where.city ?? scene.city).toUpperCase();
      const country = c?.where.country ?? scene.region;
      const period = c?.portal?.period ?? scene.period;
      let y = 106;
      ctx.font = 'bold 84px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(fit(ctx, city, maxW), x, y);
      y += 58;
      ctx.font = '40px system-ui, sans-serif';
      ctx.fillStyle = accent;
      ctx.fillText(fit(ctx, `${country}  ·  photos ${period}`, maxW), x, y);
      y += 74;
      ctx.font = 'bold 52px system-ui, sans-serif';
      ctx.fillStyle = '#f2f5fb';
      for (const line of wrap(ctx, c?.title ?? scene.title, maxW).slice(0, 2)) {
        ctx.fillText(line, x, y);
        y += 60;
      }
      y += 4;
      // The actual date, then the currencies involved, as on the chart and the map (code + color).
      const when = c ? longDate(c.date) : scene.period;
      ctx.font = '40px system-ui, sans-serif';
      ctx.fillStyle = '#d6deee';
      ctx.fillText(when, x, y);
      let cx = x + ctx.measureText(when).width + 30;
      const day = c?.date ?? scene.eventDate;
      ctx.font = 'bold 40px system-ui, sans-serif';
      for (const slot of c?.currencies ?? scene.affectedSlots) {
        const code = slot === 'EUR' && day < '1999-01-01' ? 'DEM' : slot;
        const cw = ctx.measureText(code).width;
        if (cx + cw > w - 30) break;
        ctx.fillStyle = this.slotCss[slot] ?? '#ffffff';
        ctx.fillText(code, cx, y);
        cx += cw + 22;
      }
      ctx.font = '38px system-ui, sans-serif';
      ctx.fillStyle = '#ffe2a0';
      for (const line of this.readout.slice(0, 2)) {
        y += 54;
        ctx.fillText(fit(ctx, line, maxW), x, y);
      }
      ctx.font = '23px system-ui, sans-serif';
      ctx.fillStyle = '#9fadc6';
      const foot = wrap(ctx, credits, maxW).slice(0, 2);
      let fy = h - 44 - foot.length * 28;
      for (const line of foot) {
        ctx.fillText(line, x, fy);
        fy += 28;
      }
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.fillStyle = '#c9d5ec';
      ctx.fillText('Pinch for people, policies and sources', x, h - 28);
    });
  }

  private drawDetail(i: number): void {
    const c = this.contentOf(i);
    const scene = this.scenes[i];
    const a = this.assets.get(i);
    this.detail.draw(`${i}`, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(5,8,16,0.97)';
      roundRect(ctx, 0, 0, w, h, 28);
      ctx.fill();
      ctx.strokeStyle = '#' + this.accent.getHexString();
      ctx.lineWidth = 4;
      ctx.stroke();
      let y = 70;
      const x = 48;
      const maxW = w - 96;
      ctx.font = 'bold 44px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      const when = c ? longDate(c.date) : scene.period;
      ctx.fillText(fit(ctx, `${c?.title ?? scene.title}  ·  ${when}`, maxW), x, y);
      y += 16;
      if (c?.where.note) {
        y += 34;
        ctx.font = 'italic 28px system-ui, sans-serif';
        ctx.fillStyle = '#b8c4dc';
        ctx.fillText(c.where.note, x, y);
      }
      ctx.font = '30px system-ui, sans-serif';
      ctx.fillStyle = '#e8ecf4';
      for (const line of wrap(ctx, c?.summary ?? scene.detail, maxW).slice(0, 4)) {
        y += 40;
        ctx.fillText(line, x, y);
      }
      if (c?.policies.length) {
        y += 50;
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.fillStyle = '#ffe2a0';
        ctx.fillText('Policies', x, y);
        ctx.font = '27px system-ui, sans-serif';
        ctx.fillStyle = '#e8ecf4';
        for (const p of c.policies.slice(0, 4)) {
          y += 36;
          ctx.fillText(fit(ctx, `•  ${p}`, maxW), x, y);
        }
      }
      if (c?.people.length) {
        y += 50;
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.fillStyle = '#ffe2a0';
        ctx.fillText('People', x, y);
        for (const p of c.people.slice(0, 6)) {
          y += 36;
          ctx.font = 'bold 26px system-ui, sans-serif';
          ctx.fillStyle = '#ffffff';
          const head = `${p.name}, ${p.role}: `;
          ctx.fillText(head, x, y);
          const hw = ctx.measureText(head).width;
          ctx.font = '26px system-ui, sans-serif';
          ctx.fillStyle = '#d6deee';
          ctx.fillText(fit(ctx, p.involvement, maxW - hw), x + hw, y);
        }
      }
      ctx.font = '21px system-ui, sans-serif';
      ctx.fillStyle = '#9fadc6';
      const portraits = (c?.people ?? []).filter((p) => p.portrait).map((p) => `${p.name} (${p.portrait!.license})`);
      const lines = [
        a?.kind === 'photo' ? `Photos: ${a.credits}. Wikimedia Commons.` : IMPRESSION_NOTE,
        portraits.length ? `Portraits via Wikimedia Commons: ${portraits.join(', ')}.` : '',
        'Offices checked against Wikidata or Wikipedia; see docs/history-verification.md. Pinch again to close.',
      ].filter(Boolean);
      let yy = h - 30 - (lines.length - 1) * 28;
      for (const line of lines) {
        ctx.fillText(fit(ctx, line, maxW), x, yy);
        yy += 28;
      }
    });
  }

  private setHittable(on: boolean): void {
    this.hit.raycast = on ? Mesh.prototype.raycast : () => {};
  }

  dispose(): void {
    for (const k of [...this.assets.keys()]) this.release(k);
    this.layerMeshes.forEach((m) => m.geometry.dispose());
    this.layerMats.forEach((m) => m.dispose());
    for (const m of [this.frame, this.inset, this.insetFrame]) m.geometry.dispose();
    for (const m of [this.frameMat, this.insetMat, this.insetFrameMat]) m.dispose();
    for (const p of [this.title, this.cards, this.detail]) p.dispose();
    this.motes.geometry.dispose();
    this.moteMat.dispose();
    this.hit.geometry.dispose();
    (this.hit.material as MeshBasicMaterial).dispose();
    this.root.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Portrait cards for the first few people, side by side: real portraits only, never a stand-in face. */
async function buildCards(c: HistoryEventContent, initTexture: (t: Texture) => void): Promise<People> {
  const list = c.people.slice(0, MAX_CARDS);
  const images = await Promise.all(list.map((p) => (p.portrait ? loadImage(p.portrait.src) : Promise.resolve(null))));
  const cv = document.createElement('canvas');
  cv.width = CARDS_PX;
  cv.height = Math.round((CARDS_PX * CARD_H) / CARDS_W);
  const ctx = cv.getContext('2d')!;
  const cardW = cv.width / MAX_CARDS;
  list.forEach((p, k) => {
    const x0 = k * cardW + 8;
    const cw = cardW - 16;
    ctx.fillStyle = 'rgba(5,8,16,0.86)';
    roundRect(ctx, x0, 6, cw, cv.height - 12, 22);
    ctx.fill();
    // Portrait on top (square, as stored), the name and office below.
    const side = cw - 40;
    const ph = side;
    const px = x0 + 20;
    const py = 22;
    const img = images[k];
    if (img) {
      ctx.save();
      roundRect(ctx, px, py, side, ph, 16);
      ctx.clip();
      ctx.drawImage(img, px, py, side, ph);
      ctx.restore();
    } else {
      // No verified portrait: a plain plate with initials (not a likeness).
      ctx.fillStyle = '#1b2236';
      roundRect(ctx, px, py, side, ph, 16);
      ctx.fill();
      ctx.font = 'bold 110px system-ui, sans-serif';
      ctx.fillStyle = '#8a97b4';
      ctx.textAlign = 'center';
      ctx.fillText(initials(p.name), px + side / 2, py + ph / 2 + 38);
      ctx.font = '24px system-ui, sans-serif';
      ctx.fillText('no portrait available', px + side / 2, py + ph - 22);
      ctx.textAlign = 'left';
    }
    const tw = cw - 40;
    let y = py + ph + 56;
    ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    for (const line of wrap(ctx, p.name, tw).slice(0, 2)) {
      ctx.fillText(line, px, y);
      y += 52;
    }
    ctx.font = '36px system-ui, sans-serif';
    ctx.fillStyle = '#c9d5ec';
    for (const line of wrap(ctx, p.role, tw).slice(0, 3)) {
      ctx.fillText(line, px, y);
      y += 42;
    }
    if (p.portrait) {
      ctx.font = '19px system-ui, sans-serif';
      ctx.fillStyle = '#8a97b4';
      ctx.fillText(fit(ctx, `Portrait: ${p.portrait.license}`, tw), px, cv.height - 22);
    }
  });
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  initTexture(tex);
  return { texture: tex, count: list.length };
}

function photoCredits(photos: HistoryPhoto[]): string {
  return photos.map((p) => `${p.caption}, ${p.taken} (${shortArtist(p.artist)}, ${p.license})`).join('; ');
}

function shortArtist(a: string): string {
  const s = a.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  return s.length > 28 ? s.slice(0, 27) + '…' : s;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
}

function longDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Shorten a single line to fit (with an ellipsis). */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function assetUrl(src: string): string {
  return `${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`;
}

/** Load a local image as a texture; resolves null on any failure. */
function loadTexture(src: string): Promise<Texture | null> {
  return new Promise((resolve) => {
    new TextureLoader().load(
      assetUrl(src),
      (t) => {
        t.colorSpace = SRGBColorSpace;
        resolve(t);
      },
      undefined,
      () => resolve(null),
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.src = assetUrl(src);
  return img.decode().then(
    () => img,
    () => null,
  );
}
