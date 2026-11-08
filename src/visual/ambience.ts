/**
 * Ambience: a gradient sky dome and a field of motes whose count and glow
 * follow market turbulence. Big moments shift the sky's hue slowly (over
 * seconds, never as a flash). Nothing in the world moves around the user,
 * so there is no vection (no motion sickness).
 */
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Mesh,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
} from '@iwsdk/core';

const PARTICLES = 700;

const CALM_TOP = new Color(0x0a1734);
const CALM_BOTTOM = new Color(0x020409);
const STORM_TOP = new Color(0x24163a);
const STORM_BOTTOM = new Color(0x0b0611);
const EVENT_TINT = new Color(0x3a2a10);

export class Ambience {
  readonly sky: Mesh;
  readonly motes: Points;
  private readonly skyMat: ShaderMaterial;
  private readonly moteMat: PointsMaterial;
  private turb = 0;
  private event = 0; // 0..1, decays after a major moment
  private eventTarget = 0;
  private readonly top = new Color();
  private readonly bottom = new Color();

  constructor() {
    this.skyMat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: CALM_TOP.clone() },
        bottom: { value: CALM_BOTTOM.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 bottom;
        varying vec3 vDir;
        void main() {
          float h = smoothstep(-0.35, 0.75, vDir.y);
          gl_FragColor = vec4(mix(bottom, top, h), 1.0);
        }`,
    });
    this.sky = new Mesh(new SphereGeometry(40, 32, 16), this.skyMat);
    this.sky.raycast = () => {};
    this.sky.renderOrder = -10;

    // Motes on a shell 1.6-7 m away (never inside the user's personal space).
    const pos: number[] = [];
    for (let i = 0; i < PARTICLES; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = 1.6 + Math.pow(Math.random(), 0.7) * 5.4;
      const s = Math.sqrt(1 - u * u);
      pos.push(Math.cos(th) * s * r, u * r * 0.7, Math.sin(th) * s * r);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.moteMat = new PointsMaterial({
      size: 0.035,
      map: dotTexture(),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      color: 0x9fb4ff,
      opacity: 0.4,
      toneMapped: false,
    });
    this.motes = new Points(geo, this.moteMat);
    this.motes.raycast = () => {};
  }

  /** A major event: warm the sky for a while (fades over ~6 s). */
  markEvent(): void {
    this.eventTarget = 1;
  }

  update(dt: number, turbulence: number): void {
    // Slow smoothing: color changes take seconds, never flicker.
    this.turb += (turbulence - this.turb) * Math.min(1, dt / 2.5);
    this.event += (this.eventTarget - this.event) * Math.min(1, dt / 1.5);
    this.eventTarget = Math.max(0, this.eventTarget - dt / 6);

    const t = this.turb;
    this.top.copy(CALM_TOP).lerp(STORM_TOP, t).lerp(EVENT_TINT, this.event * 0.45);
    this.bottom.copy(CALM_BOTTOM).lerp(STORM_BOTTOM, t);
    (this.skyMat.uniforms.top.value as Color).copy(this.top);
    (this.skyMat.uniforms.bottom.value as Color).copy(this.bottom);

    // More motes, brighter, as markets get rougher.
    const n = Math.floor(PARTICLES * (0.18 + 0.82 * Math.min(1, t * 1.3)));
    this.motes.geometry.setDrawRange(0, n);
    this.moteMat.opacity = 0.25 + 0.45 * t + 0.2 * this.event;
  }
}

function dotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}
