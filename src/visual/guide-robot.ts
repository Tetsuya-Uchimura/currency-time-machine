/**
 * Tock, the guide robot: a small floating companion (about 15 cm) built from
 * a handful of primitives. No lights in the scene: its pearl body uses a
 * matcap generated in code, and its face is a dark visor with glowing eyes.
 *
 *   Idle       slow float, a gentle sway, a blink every few seconds
 *   Talking    the mouth light moves with the line; a small nod
 *   Pointing   turns toward a target and reaches out; a soft beam joins them
 *   Excited    happy eye arcs, a livelier bob, side rings spin faster
 *   Traveling  leans into the tunnel, thruster bright
 *   Thinking   looks up and aside, three dots breathe above its head
 *
 * Comfort and safety: every change of brightness is smoothed (no flashing),
 * nothing moves faster than a gentle float, and the robot only ever flies
 * between a few fixed spots beside the panels (it never crosses the face).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Mood } from '../guide/guide-scripts.js';
import { haloTexture, noRaycast } from './glow.js';

const CYAN = new Color(0x5ee8ff);
const GOLD = new Color(0xffcf6e);

/** A pearl-white matcap with a cool rim (no scene lights needed). */
function pearlMatcap(tint: [string, string, string]): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(46, 40, 4, 64, 64, 64);
  g.addColorStop(0, tint[0]);
  g.addColorStop(0.55, tint[1]);
  g.addColorStop(1, tint[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function glowMat(color: Color, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: color.clone(), transparent: true, opacity, depthWrite: false, toneMapped: false });
}

export class GuideRobot {
  /** Place in the rig (rig-local meters; the user's head is the origin). */
  readonly root = new Group();
  mood: Mood = 'idle';
  /** True while a line is being spoken or shown (drives the mouth). */
  talking = false;

  private readonly body = new Group();
  private readonly eyes: Mesh[] = [];
  private readonly happy: Mesh[] = [];
  private readonly mouth: Mesh;
  private readonly antennaTip: MeshBasicMaterial;
  private readonly tipHalo: SpriteMaterial;
  private readonly rings: Mesh[] = [];
  private readonly hands: Mesh[] = [];
  private readonly thruster: MeshBasicMaterial;
  private readonly thrusterHalo: SpriteMaterial;
  private readonly dots: MeshBasicMaterial[] = [];
  private readonly beam: Line;
  private readonly beamMat: LineBasicMaterial;
  private readonly beamPos: BufferAttribute;
  private readonly home = new Vector3();
  private readonly target = new Vector3();
  private readonly look = new Vector3(0, 0, 0);
  private pointAt: Vector3 | null = null;
  private readonly pointWorld = new Vector3();
  private readonly v = new Vector3();
  private time = Math.random() * 10;
  private blinkIn = 2.5;
  private blink = 0;
  private beamShown = 0;
  private excite = 0;
  private think = 0;
  private travel = 0;
  private speak = 0;
  private yaw = 0;
  private pitch = 0;
  private visible = 0;
  private shown = true;

  constructor() {
    const scale = 0.06;
    const pearl = new MeshMatcapMaterial({ matcap: pearlMatcap(['#ffffff', '#dfe8f4', '#7d93b5']) });
    const visorMat = new MeshMatcapMaterial({ matcap: pearlMatcap(['#3a4e72', '#0c1428', '#02050c']) });

    // Head-body: a slightly squashed sphere, with a dark visor in front.
    const shell = new Mesh(new SphereGeometry(scale, 32, 24), pearl);
    shell.scale.set(1, 0.92, 0.95);
    const visor = new Mesh(new SphereGeometry(scale * 0.86, 32, 20, -Math.PI * 0.36, Math.PI * 0.72, Math.PI * 0.26, Math.PI * 0.42), visorMat);
    visor.rotation.y = -Math.PI / 2;
    visor.position.z = scale * 0.13;
    visor.scale.set(1, 1, 1.02);
    this.body.add(shell, visor);

    // Eyes: glowing rounded pills (blink by squashing), and happy arcs for Excited.
    for (const side of [-1, 1]) {
      const eye = noRaycast(new Mesh(new CircleGeometry(scale * 0.13, 24), glowMat(CYAN)));
      eye.scale.set(0.85, 1.15, 1);
      eye.position.set(side * scale * 0.3, scale * 0.12, scale * 0.97);
      eye.renderOrder = 8;
      this.body.add(eye);
      this.eyes.push(eye);
      const arc = noRaycast(new Mesh(new RingGeometry(scale * 0.09, scale * 0.14, 20, 1, 0, Math.PI), glowMat(CYAN, 0)));
      arc.position.copy(eye.position);
      arc.renderOrder = 8;
      this.body.add(arc);
      this.happy.push(arc);
    }
    this.mouth = noRaycast(new Mesh(new CircleGeometry(scale * 0.1, 20), glowMat(CYAN, 0.75)));
    this.mouth.position.set(0, -scale * 0.2, scale * 0.95);
    this.mouth.scale.set(1.6, 0.25, 1);
    this.mouth.renderOrder = 8;
    this.body.add(this.mouth);

    // Antenna with a gold tip (the "time" light).
    const stalk = new Mesh(new CylinderGeometry(scale * 0.035, scale * 0.05, scale * 0.45, 8), pearl);
    stalk.position.y = scale * 1.08;
    this.antennaTip = glowMat(GOLD);
    const tip = noRaycast(new Mesh(new SphereGeometry(scale * 0.11, 16, 12), this.antennaTip));
    tip.position.y = scale * 1.36;
    this.tipHalo = new SpriteMaterial({ map: haloTexture(), color: GOLD.clone(), blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.4, toneMapped: false });
    const tipGlow = noRaycast(new Sprite(this.tipHalo));
    tipGlow.scale.setScalar(scale * 1.1);
    tipGlow.position.copy(tip.position);
    this.body.add(stalk, tip, tipGlow);

    // Side rings ("ears") that spin slowly.
    for (const side of [-1, 1]) {
      const ring = noRaycast(new Mesh(new TorusGeometry(scale * 0.24, scale * 0.035, 8, 32), glowMat(CYAN, 0.85)));
      ring.position.set(side * scale * 0.98, scale * 0.05, 0);
      ring.rotation.y = Math.PI / 2;
      this.body.add(ring);
      this.rings.push(ring);
    }

    // Floating hands.
    for (const side of [-1, 1]) {
      const hand = new Mesh(new SphereGeometry(scale * 0.2, 16, 12), pearl);
      hand.position.set(side * scale * 1.45, -scale * 0.55, scale * 0.15);
      this.root.add(hand);
      this.hands.push(hand);
    }

    // Thruster ring under the body.
    this.thruster = glowMat(CYAN, 0.6);
    const ring = noRaycast(new Mesh(new RingGeometry(scale * 0.32, scale * 0.42, 32), this.thruster));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -scale * 1.05;
    this.thrusterHalo = new SpriteMaterial({ map: haloTexture(), color: CYAN.clone(), blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35, toneMapped: false });
    const glow = noRaycast(new Sprite(this.thrusterHalo));
    glow.scale.set(scale * 2.2, scale * 1.1, 1);
    glow.position.y = -scale * 1.15;
    this.body.add(ring, glow);

    // Thinking dots.
    for (let k = 0; k < 3; k++) {
      const m = glowMat(CYAN, 0);
      const dot = noRaycast(new Mesh(new SphereGeometry(scale * 0.07, 10, 8), m));
      dot.position.set((k - 1) * scale * 0.32, scale * 1.75, 0);
      this.body.add(dot);
      this.dots.push(m);
    }

    // Pointing beam (root space; endpoints rewritten per frame).
    const geo = new BufferGeometry();
    this.beamPos = new BufferAttribute(new Float32Array(6), 3);
    geo.setAttribute('position', this.beamPos);
    this.beamMat = new LineBasicMaterial({ color: CYAN.clone(), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    this.beam = noRaycast(new Line(geo, this.beamMat));
    this.beam.frustumCulled = false;

    this.root.add(this.body);
    this.body.traverse((o) => noRaycast(o));
    this.hands.forEach((h) => noRaycast(h));
  }

  /** The beam lives in the rig (it spans from the robot to a band); add it there. */
  get beamLine(): Line {
    return this.beam;
  }

  /** Fly to a spot (rig-local), smoothly. */
  moveTo(x: number, y: number, z: number, instant = false): void {
    this.home.set(x, y, z);
    if (instant) this.root.position.copy(this.home);
  }

  /** Point at a world-space position (null: stop pointing). */
  point(world: Vector3 | null): void {
    if (world) {
      this.pointWorld.copy(world);
      this.pointAt = this.pointWorld;
    } else {
      this.pointAt = null;
    }
  }

  setVisible(on: boolean): void {
    this.shown = on;
  }

  update(dt: number, calm: boolean): void {
    this.time += dt;
    const t = this.time;
    const ease = (cur: number, to: number, s: number) => cur + (to - cur) * Math.min(1, dt / s);
    this.visible = ease(this.visible, this.shown ? 1 : 0, 0.35);
    this.root.visible = this.visible > 0.02;
    this.root.scale.setScalar(Math.max(0.001, this.visible));

    this.excite = ease(this.excite, this.mood === 'excited' ? 1 : 0, 0.4);
    this.think = ease(this.think, this.mood === 'thinking' ? 1 : 0, 0.4);
    this.travel = ease(this.travel, this.mood === 'traveling' ? 1 : 0, 0.5);
    this.speak = ease(this.speak, this.talking ? 1 : 0, 0.15);

    // Float toward home with a gentle bob (calm: smaller and slower).
    const bobA = (calm ? 0.005 : 0.01) * (1 + 0.8 * this.excite);
    const bobF = (calm ? 0.6 : 0.9) * (1 + 0.9 * this.excite);
    this.target.copy(this.home);
    this.target.y += Math.sin(t * bobF) * bobA;
    this.root.position.lerp(this.target, Math.min(1, dt / 0.7));

    // Face the user (rig origin), or turn toward a pointing target.
    this.v.copy(this.look).sub(this.root.position);
    let wantYaw = Math.atan2(this.v.x, this.v.z);
    let wantPitch = -0.12;
    if (this.pointAt && this.root.parent) {
      const local = this.root.parent.worldToLocal(this.v.copy(this.pointAt)).sub(this.root.position);
      wantYaw = wantYaw * 0.45 + Math.atan2(local.x, local.z) * 0.55;
      wantPitch = Math.atan2(-local.y, Math.hypot(local.x, local.z)) * 0.4;
    }
    if (this.travel > 0.01) wantPitch = wantPitch * (1 - this.travel) + 0.3 * this.travel;
    if (this.think > 0.01) wantPitch -= 0.12 * this.think;
    this.yaw += (wantYaw - this.yaw) * Math.min(1, dt / 0.4);
    this.pitch += (wantPitch - this.pitch) * Math.min(1, dt / 0.4);
    this.body.rotation.set(this.pitch + Math.sin(t * 4.2) * 0.05 * this.speak, this.yaw, Math.sin(t * 0.6) * (calm ? 0.02 : 0.05));

    // Eyes: blink, look around, happy arcs.
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.14;
      this.blinkIn = 2.8 + Math.random() * 2.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    const lid = this.blink > 0 ? 0.12 : 1;
    const lookX = (this.think * -0.22 + Math.sin(t * 0.37) * 0.04) * 0.06;
    const lookY = this.think * 0.16 * 0.06;
    this.eyes.forEach((eye, k) => {
      const side = k === 0 ? -1 : 1;
      eye.position.x = side * 0.06 * 0.3 + lookX;
      eye.position.y = 0.06 * 0.12 + lookY;
      eye.scale.set(0.85, 1.15 * lid * (1 - 0.85 * this.excite) * (k === 1 ? 1 - 0.35 * this.think : 1), 1);
      (eye.material as MeshBasicMaterial).opacity = 1 - 0.9 * this.excite;
      const arc = this.happy[k];
      arc.position.set(eye.position.x, eye.position.y - 0.004, eye.position.z + 0.0005);
      (arc.material as MeshBasicMaterial).opacity = this.excite;
    });

    // Mouth: a light that moves with speech (several slow sines: no flicker).
    const voice = 0.5 + 0.25 * Math.sin(t * 9.1) + 0.2 * Math.sin(t * 5.3 + 1) + 0.15 * Math.sin(t * 13.7);
    const open = this.speak * Math.max(0.1, voice);
    this.mouth.scale.set(1.6 - 0.4 * open + 0.4 * this.excite, 0.25 + 0.85 * open, 1);

    // Lights: antenna tip glows more while talking; thinking dots breathe in turn.
    const glow = 0.55 + 0.3 * this.speak + 0.25 * this.excite + 0.15 * Math.sin(t * 1.6);
    this.antennaTip.opacity = Math.min(1, 0.7 + 0.3 * glow);
    this.tipHalo.opacity = 0.25 + 0.35 * glow;
    this.thruster.opacity = 0.45 + 0.4 * this.travel + 0.1 * Math.sin(t * 2.1);
    this.thrusterHalo.opacity = 0.25 + 0.45 * this.travel;
    this.dots.forEach((m, k) => {
      m.opacity = this.think * (0.35 + 0.55 * Math.max(0, Math.sin(t * 2.4 - k * 0.9)));
    });
    const spin = (calm ? 0.6 : 1.2) * (1 + 2 * this.excite + 2.5 * this.travel);
    this.rings.forEach((r, k) => (r.rotation.x += dt * spin * (k === 0 ? 1 : -1)));

    // Hands: rest, wave when excited, reach toward a target, tuck back in travel.
    const reach = this.pointAt ? 1 : 0;
    this.hands.forEach((h, k) => {
      const side = k === 0 ? -1 : 1;
      let x = side * 0.087;
      let y = -0.033 + Math.sin(t * 1.3 + k) * 0.004;
      let z = 0.009;
      if (this.excite > 0.01) y += this.excite * (0.03 + Math.sin(t * 5 + k * 2) * 0.008);
      if (this.think > 0.01 && k === 1) {
        x = x * (1 - this.think) + 0.02 * this.think;
        y = y * (1 - this.think) - 0.045 * this.think;
        z = z * (1 - this.think) + 0.06 * this.think;
      }
      if (this.travel > 0.01) z -= 0.03 * this.travel;
      if (reach && k === 1 && this.root.parent) {
        // Reach 8 cm toward the target (in root space).
        this.root.parent.worldToLocal(this.v.copy(this.pointWorld)).sub(this.root.position).normalize().multiplyScalar(0.08);
        x = x * 0.3 + this.v.x;
        y = y * 0.3 + this.v.y;
        z = z * 0.3 + this.v.z;
      }
      h.position.x += (x - h.position.x) * Math.min(1, dt / 0.25);
      h.position.y += (y - h.position.y) * Math.min(1, dt / 0.25);
      h.position.z += (z - h.position.z) * Math.min(1, dt / 0.25);
    });

    // Beam from the pointing hand to the target (rig space).
    this.beamShown = ease(this.beamShown, reach && this.visible > 0.5 ? 1 : 0, 0.35);
    this.beamMat.opacity = 0.55 * this.beamShown;
    this.beam.visible = this.beamShown > 0.02;
    if (this.beam.visible && this.beam.parent) {
      const hand = this.hands[1];
      hand.getWorldPosition(this.v);
      this.beam.parent.worldToLocal(this.v);
      const a = this.beamPos.array as Float32Array;
      a[0] = this.v.x;
      a[1] = this.v.y;
      a[2] = this.v.z;
      this.beam.parent.worldToLocal(this.v.copy(this.pointWorld));
      a[3] = this.v.x;
      a[4] = this.v.y;
      a[5] = this.v.z;
      this.beamPos.needsUpdate = true;
    }
  }
}
