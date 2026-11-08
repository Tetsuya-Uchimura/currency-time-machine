/**
 * Orb visuals: one glowing sphere per currency on an arc around the user.
 *
 *   height     long-run strength vs the base currency (up = stronger)
 *   brightness short-term momentum + a soft glow on every note it plays
 *   dormant    a small dim ember before the currency's data begins
 *
 * Photosensitivity: brightness is slew-rate limited and note glows decay
 * slowly, and notes are at most ~2.8/s per orb, so an orb can never flash
 * on/off three times a second.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from '@iwsdk/core';
import { LAYOUT, type SlotMeta } from '../config.js';

const MAX_BRIGHTNESS_SLEW = 1.6; // brightness units per second
const GLOW_DECAY_S = 0.9;

export interface OrbState {
  alive: boolean;
  /** Height offset in meters relative to the birth level. */
  height: number;
  /** 0..1 base brightness (from momentum). */
  brightness: number;
  /** Extra emphasis 0..1 (event focus / solo). */
  focus: number;
  code: string;
}

export class OrbView {
  readonly group = new Group();
  readonly core: Mesh;
  private readonly halo: Sprite;
  private readonly label: Mesh;
  private readonly coreMat: MeshBasicMaterial;
  private readonly haloMat: SpriteMaterial;
  private readonly labelMat: MeshBasicMaterial;
  private readonly baseColor: Color;
  private readonly tmp = new Color();
  private readonly labelCanvas: HTMLCanvasElement;
  private readonly labelTex: CanvasTexture;
  private labelCode = '';
  private glow = 0;
  private shown = 0; // displayed brightness (slew limited)
  private height = 0;
  private wake = 0; // 0 dormant -> 1 fully awake

  constructor(
    readonly meta: SlotMeta,
    readonly angle: number,
  ) {
    this.baseColor = new Color(meta.color);
    this.coreMat = new MeshBasicMaterial({ color: this.baseColor.clone(), toneMapped: false });
    this.core = new Mesh(new SphereGeometry(LAYOUT.orbRadius, 24, 16), this.coreMat);
    this.core.name = `orb-${meta.slot}`;

    this.haloMat = new SpriteMaterial({
      map: haloTexture(),
      color: this.baseColor.clone(),
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.5,
      toneMapped: false,
    });
    this.halo = new Sprite(this.haloMat);
    this.halo.scale.setScalar(LAYOUT.orbRadius * 5);
    this.halo.raycast = () => {}; // only the core sphere is interactive

    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 256;
    this.labelCanvas.height = 96;
    this.labelTex = new CanvasTexture(this.labelCanvas);
    this.labelTex.colorSpace = SRGBColorSpace;
    this.labelMat = new MeshBasicMaterial({ map: this.labelTex, transparent: true, depthWrite: false, toneMapped: false });
    this.label = new Mesh(new PlaneGeometry(0.075, 0.028), this.labelMat);
    this.label.position.y = LAYOUT.orbRadius + 0.03;
    this.label.raycast = () => {};

    this.group.add(this.core, this.halo, this.label);
    // Place on the arc; the group's +Z faces the user so the label is readable.
    const r = LAYOUT.radius;
    this.group.position.set(Math.sin(angle) * r, LAYOUT.baseY, -Math.cos(angle) * r);
    this.group.rotation.y = -angle;
  }

  /** A note was played by this currency: start a soft glow. */
  pulse(velocity: number): void {
    this.glow = Math.max(this.glow, 0.35 + 0.4 * velocity);
  }

  update(dt: number, s: OrbState): void {
    if (s.code !== this.labelCode) this.drawLabel(s.code);

    // Awakening: the ember grows into a full orb over ~1.5 s.
    this.wake += (s.alive ? 1 : -1) * dt / 1.5;
    this.wake = Math.min(1, Math.max(0, this.wake));
    const w = this.wake * this.wake * (3 - 2 * this.wake);

    // Height follows the data smoothly (no jitter between weekly samples).
    const targetH = s.alive ? s.height : 0;
    this.height += (targetH - this.height) * Math.min(1, dt * 6);
    this.group.position.y = LAYOUT.baseY + this.height;

    this.glow *= Math.exp(-dt / GLOW_DECAY_S);
    const target = s.alive ? Math.min(1.6, 0.45 + 0.45 * s.brightness + this.glow + 0.35 * s.focus) : 0.12;
    const maxStep = MAX_BRIGHTNESS_SLEW * dt;
    this.shown += Math.max(-maxStep, Math.min(maxStep, target - this.shown));

    const b = this.shown;
    this.core.scale.setScalar(0.35 + 0.65 * w);
    this.coreMat.color.copy(this.baseColor).multiplyScalar(0.35 + 0.65 * Math.min(1, b));
    if (!s.alive) this.coreMat.color.lerp(this.tmp.setRGB(0.25, 0.27, 0.32), 0.6);
    this.haloMat.opacity = w * Math.min(0.85, 0.12 + 0.5 * b);
    this.halo.scale.setScalar(LAYOUT.orbRadius * (3.5 + 2.5 * Math.min(1, b)));
    this.labelMat.opacity = 0.35 + 0.65 * w;
  }

  private drawLabel(code: string): void {
    this.labelCode = code;
    const ctx = this.labelCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 96);
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(code, 128, 50);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(code, 128, 50);
    this.labelTex.needsUpdate = true;
  }
}

/** Faint vertical guides under each orb plus the "birth level" arc. */
export function createGuides(angles: number[]): LineSegments {
  const r = LAYOUT.radius;
  const pts: number[] = [];
  const y0 = LAYOUT.baseY;
  const h = LAYOUT.heightRange;
  for (const a of angles) {
    const x = Math.sin(a) * r;
    const z = -Math.cos(a) * r;
    pts.push(x, y0 - h, z, x, y0 + h, z);
  }
  // Birth-level arc, slightly wider than the orbs.
  const span = angles[angles.length - 1] - angles[0];
  const a0 = angles[0] - span * 0.06;
  const steps = 48;
  for (let k = 0; k < steps; k++) {
    const t0 = a0 + (span * 1.12 * k) / steps;
    const t1 = a0 + (span * 1.12 * (k + 1)) / steps;
    pts.push(Math.sin(t0) * r, y0, -Math.cos(t0) * r, Math.sin(t1) * r, y0, -Math.cos(t1) * r);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  const mat = new LineBasicMaterial({ color: 0x8090b0, transparent: true, opacity: 0.22, depthWrite: false });
  const lines = new LineSegments(geo, mat);
  lines.raycast = () => {};
  return lines;
}

/** Floating info card shown above a soloed orb. */
export class InfoCard {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private lastKey = '';

  constructor() {
    this.canvas.width = 640;
    this.canvas.height = 200;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    const mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false });
    this.mesh = new Mesh(new PlaneGeometry(0.2, 0.0625), mat);
    this.mesh.raycast = () => {};
    this.mesh.visible = false;
    this.mesh.renderOrder = 10;
  }

  /** Redraws only when the text changes (cheap; called a few times a second). */
  show(line1: string, line2: string, accent: number): void {
    this.mesh.visible = true;
    const key = line1 + '|' + line2;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 640, 200);
    ctx.fillStyle = 'rgba(6,10,20,0.92)';
    roundRect(ctx, 4, 4, 632, 192, 28);
    ctx.fill();
    ctx.strokeStyle = '#' + new Color(accent).getHexString();
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 62px system-ui, sans-serif';
    ctx.fillText(line1, 320, 80);
    ctx.font = '50px system-ui, sans-serif';
    ctx.fillStyle = '#e8ecf4';
    ctx.fillText(line2, 320, 156);
    this.tex.needsUpdate = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let haloTex: CanvasTexture | null = null;
function haloTexture(): CanvasTexture {
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
