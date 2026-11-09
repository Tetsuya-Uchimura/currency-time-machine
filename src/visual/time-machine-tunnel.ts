/**
 * The time machine: a tunnel of gold and cyan light rings that the user looks
 * into while the year counter runs back (or forward) to the chosen year.
 *
 * The user never moves. The camera stays where it is; the RINGS travel toward
 * the user out of the depth, and fade before they get near (nothing sweeps
 * through the edge of vision, which is what causes most vection discomfort).
 * The robot and the hand panel stay in place as fixed reference points, and a
 * still "cockpit" ring frames the view. There is no white flash: the arrival
 * is a soft warm glow that grows and fades over half a second.
 *
 * Calm mode (reduced motion): the rings stay still at their depths and a wave
 * of light runs through them from front to back; no streaks.
 *
 * Quest budget: 16 thin ring meshes (only the ring area is drawn), one line
 * set of 120 streaks, 260 points, a few small text planes. No post effects.
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from '@iwsdk/core';
import { warpYearAt } from '../playback/year-journey.js';
import { haloTexture, noRaycast, TextPlane } from './glow.js';

const GOLD = new Color(0xffc75a);
const CYAN = new Color(0x46e0ff);
const RINGS = 16;
const SPACING = 0.85;
const NEAR = 1.15;
const RADIUS = 0.8;
const STREAKS = 120;
const MOTES = 260;

const RING_VERT = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// A soft glowing band with a bright core and HUD-like dashes.
const RING_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uSpin;
  uniform float uDash;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float t = (r - 0.9) / 0.2;
    float core = exp(-pow((t - 0.5) / 0.07, 2.0));
    float glow = 0.35 * exp(-pow((t - 0.5) / 0.26, 2.0));
    float a = atan(vP.y, vP.x) / 6.2831853 + uSpin;
    float dash = smoothstep(0.0, 0.04, fract(a * 24.0)) * smoothstep(0.62, 0.55, fract(a * 24.0));
    float arc = smoothstep(0.0, 0.03, fract(a * 3.0)) * smoothstep(0.86, 0.8, fract(a * 3.0));
    float m = mix(1.0, 0.45 + 0.55 * dash, uDash) * mix(1.0, arc, uDash * 0.5);
    gl_FragColor = vec4(uColor * (core + glow) * m * uOpacity, 1.0);
  }
`;

interface Ring {
  mesh: Mesh;
  mat: ShaderMaterial;
  z: number;
  label: TextPlane;
  year: number;
}

export class TimeMachineTunnel {
  /** Add to the rig (centered on the user's head). */
  readonly root = new Group();
  /** 0..1 while the warp runs (the experience fades the bands with `curtain`). */
  active = false;
  /** Opacity of the dark veil in front of the bands (0..1). */
  curtain = 0;

  private readonly veil: MeshBasicMaterial;
  private readonly rings: Ring[] = [];
  private readonly frame: ShaderMaterial;
  private readonly streakGeo = new BufferGeometry();
  private readonly streakPos: Float32Array;
  private readonly streakCol: Float32Array;
  private readonly streakData: { a: number; r: number; z: number; c: Color }[] = [];
  private readonly streakMat: LineBasicMaterial;
  private readonly motes: Points;
  private readonly moteMat: PointsMaterial;
  private readonly moteData: { a: number; r: number; z: number; w: number }[] = [];
  private readonly glow: SpriteMaterial;
  private readonly glowSprite: Sprite;
  private readonly counter: TextPlane;
  private readonly tmp = new Color();

  private t = 0;
  private duration = 2.8;
  private fromYear = 2026;
  private toYear = 1985;
  private calm = false;
  private nextLabelYear = 0;
  private finishing = -1;

  constructor() {
    this.root.visible = false;
    // The veil: a dark sphere just inside the bands (the robot and hand panel are nearer).
    this.veil = new MeshBasicMaterial({ color: 0x02040b, transparent: true, opacity: 0, side: BackSide, depthWrite: false, toneMapped: false });
    const veil = noRaycast(new Mesh(new SphereGeometry(1.0, 32, 16), this.veil));
    veil.renderOrder = 40;
    this.root.add(veil);

    const geo = new RingGeometry(0.9, 1.1, 160, 1);
    for (let k = 0; k < RINGS; k++) {
      const mat = new ShaderMaterial({
        uniforms: {
          uColor: { value: (k % 2 ? CYAN : GOLD).clone() },
          uOpacity: { value: 0 },
          uSpin: { value: Math.random() },
          uDash: { value: k % 3 === 0 ? 1 : 0.35 },
        },
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      });
      const mesh = noRaycast(new Mesh(geo, mat));
      mesh.renderOrder = 41;
      mesh.scale.setScalar(RADIUS * (k % 2 ? 0.92 : 1));
      const label = new TextPlane(0.26, 0.07, 64);
      label.mesh.renderOrder = 42;
      label.mesh.position.set(0.62, 0.62, 0);
      label.mesh.rotation.z = -Math.PI / 4;
      mesh.add(label.mesh);
      this.root.add(mesh);
      this.rings.push({ mesh, mat, z: -(NEAR + k * SPACING), label, year: 0 });
    }

    // A still frame close to the user: a fixed reference in the moving light.
    this.frame = new ShaderMaterial({
      uniforms: { uColor: { value: CYAN.clone() }, uOpacity: { value: 0 }, uSpin: { value: 0 }, uDash: { value: 1 } },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    const frame = noRaycast(new Mesh(geo, this.frame));
    frame.scale.setScalar(0.62);
    frame.position.z = -0.92;
    frame.renderOrder = 41;
    this.root.add(frame);

    // Streaks of light along the tunnel.
    this.streakPos = new Float32Array(STREAKS * 6);
    this.streakCol = new Float32Array(STREAKS * 6);
    for (let k = 0; k < STREAKS; k++) {
      this.streakData.push({ a: Math.random() * Math.PI * 2, r: 0.35 + Math.random() * 0.5, z: -(2 + Math.random() * 12), c: Math.random() < 0.5 ? GOLD : CYAN });
    }
    this.streakGeo.setAttribute('position', new BufferAttribute(this.streakPos, 3));
    this.streakGeo.setAttribute('color', new BufferAttribute(this.streakCol, 3));
    this.streakMat = new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const streaks = noRaycast(new LineSegments(this.streakGeo, this.streakMat));
    streaks.frustumCulled = false;
    streaks.renderOrder = 41;
    this.root.add(streaks);

    // Motes drifting in a slow spiral.
    const mp = new Float32Array(MOTES * 3);
    for (let k = 0; k < MOTES; k++) this.moteData.push({ a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.75, z: -(1.4 + Math.random() * 12), w: 0.2 + Math.random() * 0.5 });
    const mg = new BufferGeometry();
    mg.setAttribute('position', new BufferAttribute(mp, 3));
    this.moteMat = new PointsMaterial({ size: 0.022, map: haloTexture(), color: 0xffe2a8, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    this.motes = noRaycast(new Points(mg, this.moteMat));
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 41;
    this.root.add(this.motes);

    // The light at the end of the tunnel (warm, never white).
    this.glow = new SpriteMaterial({ map: haloTexture(), color: 0xffd38a, blending: AdditiveBlending, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.glowSprite = noRaycast(new Sprite(this.glow));
    this.glowSprite.position.z = -13;
    this.glowSprite.scale.setScalar(5);
    this.glowSprite.renderOrder = 41;
    this.root.add(this.glowSprite);

    // The year counter.
    this.counter = new TextPlane(0.7, 0.22, 200);
    this.counter.mesh.position.set(0, 0.02, -2.2);
    this.counter.mesh.renderOrder = 43;
    this.root.add(this.counter.mesh);
  }

  /** Start a warp from one year to another. `seconds` ~2.8; calm = reduced motion. */
  start(fromYear: number, toYear: number, seconds: number, calm: boolean): void {
    this.fromYear = fromYear;
    this.toYear = toYear;
    this.duration = seconds;
    this.calm = calm;
    this.t = 0;
    this.finishing = -1;
    this.active = true;
    this.root.visible = true;
    const dir = toYear <= fromYear ? -1 : 1;
    this.nextLabelYear = fromYear;
    this.rings.forEach((r, k) => {
      r.z = -(NEAR + 0.6 + k * SPACING);
      this.labelRing(r, fromYear + dir * Math.round((k / RINGS) * Math.abs(toYear - fromYear) * 0.4));
    });
  }

  /** Jump to the arrival (Skip): a short fade instead of the full ride. */
  finish(): void {
    if (this.active && this.finishing < 0) this.finishing = 0;
  }

  /** Seconds from start to the moment the destination should be revealed. */
  get revealAt(): number {
    return this.duration * 0.82;
  }

  /** The warp's own time (s); the caller reveals the year when it passes revealAt. */
  get time(): number {
    return this.t;
  }

  private labelRing(r: Ring, year: number): void {
    r.year = year;
    const text = String(year);
    r.label.draw(text, (ctx, w, h) => {
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(h * 0.7)}px system-ui, sans-serif`;
      ctx.fillStyle = '#bdf4ff';
      ctx.fillText(text, 6, h / 2);
    });
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    if (this.finishing >= 0) this.finishing += dt;
    const p = Math.min(1, this.t / this.duration);
    // Envelope: rings in (0-0.18), ride, out (0.8-1). Skip: out over 0.45 s.
    let env = Math.min(1, p / 0.18) * Math.min(1, (1 - p) / 0.2 + 0.0001);
    if (this.finishing >= 0) env *= Math.max(0, 1 - this.finishing / 0.45);
    // Veil: up fast, and down only after the reveal.
    const veilTarget = this.finishing >= 0 ? Math.max(0, 1 - this.finishing / 0.45) : p < 0.85 ? Math.min(1, p / 0.12) : Math.max(0, (1 - p) / 0.15);
    this.curtain = 0.95 * veilTarget;
    this.veil.opacity = this.curtain;

    // Speed along the tunnel: rises and falls (m/s); zero in calm mode.
    const speed = this.calm ? 0 : 7.5 * Math.sin(Math.PI * Math.min(1, p / 0.92));
    const dir = this.toYear <= this.fromYear ? -1 : 1;
    const span = RINGS * SPACING;
    const far = NEAR + span;
    this.rings.forEach((r, k) => {
      r.z += speed * dt;
      if (r.z > -NEAR) {
        r.z -= span;
        // Each new ring carries the next year on the way.
        const shown = warpYearAt(this.fromYear, this.toYear, p);
        this.nextLabelYear = dir < 0 ? Math.min(shown, this.nextLabelYear - 1) : Math.max(shown, this.nextLabelYear + 1);
        this.labelRing(r, Math.max(Math.min(this.nextLabelYear, Math.max(this.fromYear, this.toYear)), Math.min(this.fromYear, this.toYear)));
      }
      r.mesh.position.z = r.z;
      const d = -r.z;
      // Fade in from the depth, fade out before getting near (keeps the edges of vision calm).
      const nearFade = Math.min(1, Math.max(0, (d - NEAR) / 1.3));
      const farFade = Math.min(1, Math.max(0, (far - d) / 3));
      let a = nearFade * farFade;
      if (this.calm) {
        // A slow wave of light runs from front to back.
        const wave = 0.5 + 0.5 * Math.cos((d - this.t * 3.2) * 1.1);
        a *= 0.35 + 0.65 * wave;
      }
      r.mat.uniforms.uOpacity.value = a * env * 0.95;
      r.mat.uniforms.uSpin.value += dt * (k % 2 ? 0.03 : -0.02);
      r.label.mat.opacity = a * env * 0.85;
    });
    this.frame.uniforms.uOpacity.value = 0.32 * env;
    this.frame.uniforms.uSpin.value += dt * 0.01;

    // Streaks: lines along the tunnel, longer when faster (hidden in calm mode).
    const len = 0.15 + Math.abs(speed) * 0.09;
    const sp = this.streakPos;
    const sc = this.streakCol;
    for (let k = 0; k < STREAKS; k++) {
      const s = this.streakData[k];
      s.z += speed * 1.25 * dt;
      if (s.z > -NEAR - 0.4) s.z -= 12;
      const x = Math.cos(s.a) * s.r;
      const y = Math.sin(s.a) * s.r;
      sp.set([x, y, s.z, x, y, s.z - len], k * 6);
      const d = -s.z;
      const a = this.calm ? 0 : Math.min(1, Math.max(0, (d - NEAR - 0.4) / 1.5)) * Math.min(1, (14 - d) / 3) * env * 0.8;
      this.tmp.copy(s.c).multiplyScalar(a);
      sc.set([this.tmp.r, this.tmp.g, this.tmp.b, 0, 0, 0], k * 6);
    }
    (this.streakGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.streakGeo.getAttribute('color') as BufferAttribute).needsUpdate = true;

    // Motes spiral slowly (and drift toward the user with the flow).
    const mp = this.motes.geometry.getAttribute('position') as BufferAttribute;
    const arr = mp.array as Float32Array;
    for (let k = 0; k < MOTES; k++) {
      const m = this.moteData[k];
      m.a += dt * m.w * (this.calm ? 0.3 : 1);
      m.z += speed * 0.6 * dt;
      if (m.z > -NEAR) m.z -= 12;
      arr[k * 3] = Math.cos(m.a) * m.r;
      arr[k * 3 + 1] = Math.sin(m.a) * m.r;
      arr[k * 3 + 2] = m.z;
    }
    mp.needsUpdate = true;
    this.moteMat.opacity = 0.8 * env;

    // The warm light at the end swells softly at the arrival.
    const arrive = Math.max(0, Math.min(1, (p - 0.7) / 0.15)) * Math.max(0, Math.min(1, (1 - p) / 0.15));
    this.glow.opacity = (0.35 + 0.25 * arrive) * env;
    this.glowSprite.scale.setScalar(5 + 3 * arrive);

    // The counter: running years, then the destination held large.
    const year = this.finishing >= 0 ? this.toYear : warpYearAt(this.fromYear, this.toYear, p);
    const done = year === this.toYear && p > 0.7;
    const key = `${year}|${done}`;
    this.counter.draw(key, (ctx, w, h) => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(h * 0.78)}px system-ui, sans-serif`;
      ctx.shadowColor = done ? 'rgba(255,200,110,0.9)' : 'rgba(70,224,255,0.9)';
      ctx.shadowBlur = h * 0.12;
      ctx.fillStyle = done ? '#ffe3a6' : '#d9f7ff';
      ctx.fillText(String(year), w / 2, h / 2);
    });
    this.counter.mat.opacity = Math.min(1, env * 1.3);
    this.counter.mesh.scale.setScalar(done ? 1 + 0.15 * arrive : 1);

    if (p >= 1 || (this.finishing >= 0 && this.finishing >= 0.45)) {
      this.active = false;
      this.root.visible = false;
      this.curtain = 0;
      this.veil.opacity = 0;
    }
  }
}
