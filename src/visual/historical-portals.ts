/**
 * Historical Portals: a "window onto the era" that rises far behind the orbs
 * when one of four major moments approaches.
 *
 * Depth (meters ahead of the user): orbs 0.6, solo lane 0.95, captions 1.1,
 * portal 1.9. It sits behind everything, so it can never hide an orb, a trail,
 * the hand panel or the caption, and it is placed below the caption board.
 * If the solo lane is open, the lane wins: the portal dims to let it read.
 *
 * Layers (front to back): drifting motes, title plate, glowing outline,
 * foreground, city, sky. The three scene layers are separate paintings, so the
 * small offsets between them give an honest parallax when the head moves; a
 * verified photograph (if one is ever added) is shown flat on a single layer
 * and never warped.
 *
 * Animation (all eased, nothing flashes): the outline draws itself from the
 * top, the city fades in, then the title. On the event date the scene
 * brightens a little and the motes spread. Leaving, color and brightness
 * drain first, then the outline. Assets of the next window are prepared in
 * idle time ahead of it; a closed window's textures are released.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CustomBlending,
  DynamicDrawUsage,
  BufferAttribute,
  BufferGeometry,
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
import { PORTAL } from '../config.js';
import { displayablePhoto, provenance, sceneStyle, type PortalScene } from '../data/portals.js';
import { paintCity } from './city-painter.js';
import { haloTexture } from './orbs.js';

export interface PortalView {
  /** Scene index from the director (-1: none). */
  index: number;
  appear: number;
  highlight: number;
  out: number;
  /** False while paused: motes freeze with time. */
  flowing: boolean;
  /** 0..1 visibility of the solo lane (it has priority). */
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

/** Scene layer: saturation/brightness control and soft edges (a hologram look). */
const LAYER_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uSat;
  uniform float uBright;
  uniform vec2 uEdge;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(uMap, vUv);
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
    float d = abs(sdRoundRect(p, uHalf, 0.03));
    float line = exp(-pow(d / 0.0032, 2.0));
    float halo = exp(-d / 0.011) * 0.22;
    float ang = abs(atan(p.x, p.y)) / 3.14159265;
    float shown = smoothstep(uReveal + 0.04, uReveal - 0.04, ang);
    float a = (line + halo) * shown * uIntensity;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), line * 0.35) * a, 1.0);
    #include <colorspace_fragment>
  }`;

interface SceneAssets {
  layers: Texture[];
  /** True when `layers` holds a single verified photograph. */
  photo: boolean;
}

const MOTES = 90;

export class HistoricalPortals {
  /** Add to the rig (rig-local space). */
  readonly root = new Group();
  /** Invisible pinch target covering the window (raycast only while shown). */
  readonly hit: Mesh;

  private readonly scenes: PortalScene[];
  private readonly initTexture: (t: Texture) => void;
  private readonly assets = new Map<number, SceneAssets>();
  private readonly pending = new Set<number>();
  private readonly layerMeshes: Mesh[] = [];
  private readonly layerMats: ShaderMaterial[] = [];
  private readonly frameMat: ShaderMaterial;
  private readonly frame: Mesh;
  private readonly label: Mesh;
  private readonly labelMat: MeshBasicMaterial;
  private readonly labelCanvas = document.createElement('canvas');
  private readonly labelTex: CanvasTexture;
  private readonly motes: Points;
  private readonly moteMat: PointsMaterial;
  private readonly motePos: BufferAttribute;
  private readonly moteSeed: Float32Array;
  private readonly accent = new Color();
  private displayed = -1;
  private switching = 1; // 1 = fully shown, falls to 0 while switching scenes
  private details = false;
  private labelKey = '';
  private time = 0;
  private visible = 0;
  /** Last envelope of the displayed window, held while it is being switched out. */
  private readonly held = { appear: 0, out: 0, hl: 0 };

  constructor(scenes: PortalScene[], initTexture: (t: Texture) => void = () => {}) {
    this.scenes = scenes;
    this.initTexture = initTexture;
    const W = PORTAL.width;
    const H = PORTAL.height;
    this.root.position.set(0, PORTAL.y, -PORTAL.z);

    // Scene layers, back to front, each a little larger as it goes deeper so
    // they still fill the window from the seat.
    const depths = [-0.12, -0.06, -0.018];
    depths.forEach((z, k) => {
      const mat = new ShaderMaterial({
        uniforms: {
          uMap: { value: null },
          uOpacity: { value: 0 },
          uSat: { value: 1 },
          uBright: { value: 1 },
          uEdge: { value: [0.06, 0.1] },
        },
        vertexShader: LAYER_VERT,
        fragmentShader: LAYER_FRAG,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const s = 1 + (-z / PORTAL.z) * 1.0;
      const mesh = new Mesh(new PlaneGeometry(W * s, H * s), mat);
      mesh.position.z = z;
      mesh.renderOrder = -6 + k;
      mesh.raycast = () => {};
      mesh.visible = false;
      this.layerMeshes.push(mesh);
      this.layerMats.push(mat);
      this.root.add(mesh);
    });

    // Outline.
    const pad = 0.1;
    this.frameMat = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(0xffffff) },
        uSize: { value: [W + pad, H + pad] },
        uHalf: { value: [W / 2, H / 2] },
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
    this.frame = new Mesh(new PlaneGeometry(W + pad, H + pad), this.frameMat);
    this.frame.renderOrder = -2;
    this.frame.raycast = () => {};
    this.frame.visible = false;
    this.root.add(this.frame);

    // Title plate.
    this.labelCanvas.width = 1280;
    this.labelCanvas.height = 400;
    this.labelTex = new CanvasTexture(this.labelCanvas);
    this.labelTex.colorSpace = SRGBColorSpace;
    this.labelMat = new MeshBasicMaterial({ map: this.labelTex, transparent: true, depthWrite: false, opacity: 0, toneMapped: false });
    this.label = new Mesh(new PlaneGeometry(0.95, 0.297), this.labelMat);
    // In the sky, top-right: clear of the skyline, and of the orbs that
    // usually ride high (the franc and the mark sit left of center).
    this.label.position.set(W / 2 - 0.475 - 0.035, H / 2 - 0.1485 - 0.03, 0.012);
    this.label.renderOrder = -1;
    this.label.raycast = () => {};
    this.label.visible = false;
    this.root.add(this.label);

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

  /** Is a window on screen (for input and diagnostics)? */
  get shown(): boolean {
    return this.visible > 0.3;
  }

  /** Dev diagnostics: what is on screen. */
  get debug(): string {
    return `${this.displayed}:${this.visible.toFixed(2)}/label${this.labelMat.opacity.toFixed(2)}${this.label.visible ? '+' : '-'}/details${this.details ? 1 : 0}`;
  }

  get showingDetails(): boolean {
    return this.details;
  }

  /** Pinch on the window: two or three sentences of context, then back. */
  toggleDetails(): void {
    if (this.displayed < 0 || !this.shown) return;
    this.details = !this.details;
  }

  hideDetails(): void {
    this.details = false;
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
    const scene = this.scenes[i];
    const photo = displayablePhoto(scene);
    if (photo) {
      const tex = await loadTexture(`${import.meta.env.BASE_URL}${photo.replace(/^\//, '')}`);
      if (tex) {
        this.initTexture(tex);
        this.assets.set(i, { layers: [tex], photo: true });
        return;
      }
      // Missing or broken photo: fall back to the impression.
    }
    this.assets.set(i, this.paint(i));
  }

  private paint(i: number): SceneAssets {
    const layers = paintCity(sceneStyle(this.scenes[i]));
    const textures = [layers.sky, layers.city, layers.front].map((c) => {
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      this.initTexture(t);
      return t;
    });
    return { layers: textures, photo: false };
  }

  private release(i: number): void {
    const a = this.assets.get(i);
    if (!a) return;
    a.layers.forEach((t) => t.dispose());
    this.assets.delete(i);
  }

  private show(i: number): void {
    this.displayed = i;
    this.details = false;
    this.labelKey = '';
    if (i < 0) return;
    if (!this.assets.has(i)) this.assets.set(i, this.paint(i)); // jumped straight in
    const a = this.assets.get(i)!;
    this.layerMeshes.forEach((m, k) => {
      const tex = a.photo ? (k === 1 ? a.layers[0] : null) : a.layers[k];
      this.layerMats[k].uniforms.uMap.value = tex;
      m.visible = !!tex;
    });
    this.accent.set(this.scenes[i].accent);
    (this.frameMat.uniforms.uColor.value as Color).copy(this.accent);
    this.moteMat.color.copy(this.accent);
    // Keep only this window's textures (and anything still being prepared).
    for (const k of [...this.assets.keys()]) if (k !== i) this.release(k);
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

    const frameIn = smooth(appear / 0.4);
    const imageIn = smooth((appear - 0.2) / 0.7);
    const labelIn = smooth((appear - 0.55) / 0.45);
    const imageOut = smooth(out / 0.75);
    const frameOut = smooth((out - 0.35) / 0.65);

    const imageOpacity = 0.85 * imageIn * (1 - imageOut) * q * laneDim;
    this.visible = on ? Math.max(imageOpacity / 0.85, frameIn * (1 - frameOut) * q) : 0;
    const sat = 1 - 0.85 * smooth(out / 0.6);
    const bright = 1.25 + 0.3 * hl - 0.6 * smooth(out / 0.8);
    this.layerMats.forEach((m) => {
      m.uniforms.uOpacity.value = imageOpacity;
      m.uniforms.uSat.value = sat;
      m.uniforms.uBright.value = bright;
    });
    this.frameMat.uniforms.uReveal.value = frameIn;
    this.frameMat.uniforms.uIntensity.value = frameIn * (1 - frameOut) * q * laneDim * (0.75 + 0.6 * hl);
    // The solo lane has priority: the title steps aside so texts never overlap.
    this.labelMat.opacity = labelIn * (1 - smooth(out / 0.5)) * q * (1 - v.laneVisible);

    const visible = on && this.visible > 0.002;
    this.frame.visible = visible;
    this.label.visible = visible && this.labelMat.opacity > 0.002;
    this.motes.visible = visible;
    for (const m of this.layerMeshes) if (!visible) m.visible = false;
    if (visible) {
      const a = this.assets.get(i);
      this.layerMeshes.forEach((m, k) => (m.visible = !!a && (a.photo ? k === 1 : true)));
    }
    this.setHittable(visible && this.shown);
    if (!visible) return;

    if (v.flowing) this.time += dt; // motes freeze while paused, like time
    this.updateMotes(hl, imageIn * (1 - imageOut) * q);
    this.drawLabel(i);
  }

  private updateMotes(hl: number, vis: number): void {
    const W = PORTAL.width;
    const H = PORTAL.height;
    const p = this.motePos.array as Float32Array;
    const s = this.moteSeed;
    const spread = 1 + 0.18 * hl;
    for (let k = 0; k < MOTES; k++) {
      const rise = (s[4 * k + 1] + this.time * (0.008 + 0.02 * s[4 * k + 2])) % 1;
      const sway = Math.sin(this.time * 0.3 + s[4 * k + 3] * 6.28) * 0.01;
      p[3 * k] = ((s[4 * k] - 0.5) * W * 0.96 + sway) * spread;
      p[3 * k + 1] = ((rise - 0.5) * H * 0.92) * spread;
      p[3 * k + 2] = 0.03 + s[4 * k + 3] * 0.22;
    }
    this.motePos.needsUpdate = true;
    this.moteMat.opacity = vis * (0.35 + 0.45 * hl);
  }

  private drawLabel(i: number): void {
    const scene = this.scenes[i];
    const key = `${i}|${this.details}`;
    if (key === this.labelKey) return;
    this.labelKey = key;
    const ctx = this.labelCanvas.getContext('2d')!;
    const w = this.labelCanvas.width;
    const h = this.labelCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Dark plate that fades to the right, so text reads over the city.
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(4,7,14,0)');
    g.addColorStop(0.06, 'rgba(4,7,14,0.82)');
    g.addColorStop(1, 'rgba(4,7,14,0.82)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const accent = '#' + this.accent.getHexString();
    ctx.fillStyle = accent;
    ctx.fillRect(28, 34, 6, h - 68);

    let y = 98;
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    const city = scene.city.toUpperCase();
    ctx.fillText(city, 56, y);
    const cw = ctx.measureText(city).width;
    ctx.font = '40px system-ui, sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(`  ${scene.period}`, 56 + cw, y);
    y += 56;
    if (this.details) {
      ctx.font = '31px system-ui, sans-serif';
      ctx.fillStyle = '#eef2fa';
      for (const line of wrap(ctx, scene.detail, w - 120).slice(0, 5)) {
        ctx.fillText(line, 56, y);
        y += 40;
      }
    } else {
      ctx.font = '38px system-ui, sans-serif';
      ctx.fillStyle = '#e6ebf5';
      ctx.fillText(scene.title, 56, y);
      y += 50;
    }
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillStyle = '#a9b6cf';
    const hint = this.details ? 'Pinch again to close' : 'Pinch the window for more';
    ctx.fillText(`${provenance(scene)}   |   ${hint}`, 56, Math.min(h - 26, y + 8));
    this.labelTex.needsUpdate = true;
  }

  private setHittable(on: boolean): void {
    this.hit.raycast = on ? Mesh.prototype.raycast : () => {};
  }

  dispose(): void {
    for (const k of [...this.assets.keys()]) this.release(k);
    this.layerMeshes.forEach((m) => m.geometry.dispose());
    this.layerMats.forEach((m) => m.dispose());
    this.frame.geometry.dispose();
    this.frameMat.dispose();
    this.label.geometry.dispose();
    this.labelMat.dispose();
    this.labelTex.dispose();
    this.motes.geometry.dispose();
    this.moteMat.dispose();
    this.hit.geometry.dispose();
    (this.hit.material as MeshBasicMaterial).dispose();
    this.root.removeFromParent();
  }
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

/** Load a local image as a texture; resolves null on any failure. */
function loadTexture(url: string): Promise<Texture | null> {
  return new Promise((resolve) => {
    new TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = SRGBColorSpace;
        resolve(t);
      },
      undefined,
      () => resolve(null),
    );
  });
}

