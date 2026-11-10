/**
 * Depth layers: the room around the three bands, so they read as objects in
 * a space (an observation deck of the time machine) rather than a screen.
 *
 *   frame     still: two tall arcs at the left and right (the deck's window
 *             struts), two rings on the floor below the seat. A fixed frame of
 *             reference at known depths: moving the head shows real parallax
 *             against the bands, and still things steady the eye.
 *   glints    mid-depth (2-3 m): soft points that sway a few centimeters,
 *             each at its own slow pace (half a minute per sway).
 *   streams   left and right, ahead of the user: two currents of light that
 *             drift toward the user out of the depth and fade before they
 *             come near (nothing ever passes the edge of vision). Slow while
 *             the year is shown; in the time tunnel they flow faster (eased
 *             in and out over a second, never a jolt).
 *   dial      far behind the top band: a faint ring of ticks, turning a few
 *             degrees a minute (faster in the tunnel).
 *   band glints  a few faint points behind the chart and the events band that
 *             drift sideways with the year while it flows (BandGlints).
 *
 * Comfort: the camera and the user are never moved or turned; nothing moves
 * faster than a slow drift outside the tunnel; no flashing. Calm motion stops
 * every automatic drift (the streams barely move even in the tunnel).
 *
 * Quest budget: about 330 points updated on the CPU (no allocation per
 * frame), a few line loops, no lights, no post effects.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Points,
  PointsMaterial,
} from '@iwsdk/core';
import { haloTexture, noRaycast } from './glow.js';

const STREAM = 110; // per side
const GLINTS = 70;

/** Stream space (rig-local): z from FAR (appear) to NEAR (fade out), x within [X0, X1] on each side. */
const FAR = -7.5;
const NEAR = -2.3;
const X0 = 1.5;
const X1 = 2.7;

export interface DepthState {
  calm: boolean;
  /** The time tunnel is running. */
  warp: boolean;
}

export class DepthLayers {
  readonly root = new Group();
  private readonly streamPos: BufferAttribute;
  private readonly streamMat: PointsMaterial;
  private readonly streamBase: Float32Array;
  private readonly streamColor: Float32Array;
  private readonly streamCol: BufferAttribute;
  private readonly glintPos: BufferAttribute;
  private readonly glintBase: Float32Array;
  private readonly glintPhase: Float32Array;
  private readonly dial: Group;
  private shift = 0;
  private speed = 0;
  private time = 0;
  private sway = 1;

  constructor() {
    // Frame: tall arcs at the sides (half circles standing upright), rings on the floor.
    const frameMat = new LineBasicMaterial({ color: 0x5a86c8, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
    for (const side of [-1, 1]) {
      const pts: number[] = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI; // a half circle from floor to floor, standing in the plane x = const
        pts.push(side * 2.3, -1.15 + Math.sin(a) * 2.6, -1.4 - Math.cos(a) * 1.5);
      }
      const segs: number[] = [];
      for (let i = 0; i < pts.length / 3 - 1; i++) segs.push(...pts.slice(i * 3, i * 3 + 6));
      this.root.add(noRaycast(new LineSegments(geometry(segs), frameMat)));
    }
    const floorMat = new LineBasicMaterial({ color: 0x3f6db0, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false });
    for (const r of [1.2, 2.1]) {
      const pts: number[] = [];
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pts.push(Math.cos(a) * r, -1.18, Math.sin(a) * r);
      }
      this.root.add(noRaycast(new LineLoop(geometry(pts), floorMat)));
    }
    // Floor ticks every 15 degrees on the outer ring (a compass rose: still, for orientation).
    const ticks: number[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ticks.push(Math.cos(a) * 2.0, -1.18, Math.sin(a) * 2.0, Math.cos(a) * 2.2, -1.18, Math.sin(a) * 2.2);
    }
    this.root.add(noRaycast(new LineSegments(geometry(ticks), floorMat)));

    // Glints at mid depth, in front and to the sides (never behind, never close).
    this.glintBase = new Float32Array(GLINTS * 3);
    this.glintPhase = new Float32Array(GLINTS * 2);
    for (let i = 0; i < GLINTS; i++) {
      const yaw = (Math.random() * 2 - 1) * 1.35;
      const r = 2.0 + Math.random() * 1.2;
      this.glintBase[i * 3] = Math.sin(yaw) * r;
      this.glintBase[i * 3 + 1] = -0.7 + Math.random() * 2.1;
      this.glintBase[i * 3 + 2] = -Math.cos(yaw) * r;
      this.glintPhase[i * 2] = Math.random() * Math.PI * 2;
      this.glintPhase[i * 2 + 1] = (Math.PI * 2) / (22 + Math.random() * 14); // a sway every 22-36 s
    }
    this.glintPos = new BufferAttribute(this.glintBase.slice(), 3);
    const gg = new BufferGeometry();
    gg.setAttribute('position', this.glintPos);
    const glintMat = new PointsMaterial({ size: 0.03, map: haloTexture(), color: 0xbfd2ff, transparent: true, opacity: 0.35, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    const glints = noRaycast(new Points(gg, glintMat));
    glints.frustumCulled = false;
    this.root.add(glints);

    // Streams: two currents ahead-left and ahead-right.
    this.streamBase = new Float32Array(STREAM * 2 * 3);
    const colors = new Float32Array(STREAM * 2 * 3);
    const gold = new Color(0xffd27a);
    const cyan = new Color(0x7fdcff);
    const c = new Color();
    for (let i = 0; i < STREAM * 2; i++) {
      const side = i < STREAM ? -1 : 1;
      this.streamBase[i * 3] = side * (X0 + Math.random() * (X1 - X0));
      this.streamBase[i * 3 + 1] = -0.6 + Math.random() * 1.9;
      this.streamBase[i * 3 + 2] = Math.random(); // (0..1 along the stream; placed in update)
      c.copy(cyan).lerp(gold, Math.random() < 0.3 ? 0.8 : 0.1);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    this.streamColor = colors;
    this.streamPos = new BufferAttribute(new Float32Array(STREAM * 2 * 3), 3);
    this.streamCol = new BufferAttribute(new Float32Array(STREAM * 2 * 3), 3);
    const sg = new BufferGeometry();
    sg.setAttribute('position', this.streamPos);
    sg.setAttribute('color', this.streamCol);
    this.streamMat = new PointsMaterial({ size: 0.05, map: haloTexture(), vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    const streams = noRaycast(new Points(sg, this.streamMat));
    streams.frustumCulled = false;
    // Drawn after the time tunnel's dark veil (src/visual/time-machine-tunnel.ts, render order 40), so the
    // currents still flow at the sides while it hides the bands.
    streams.renderOrder = 41;
    this.root.add(streams);

    // The far dial: a ring of 72 ticks behind the top band.
    const dialPts: number[] = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const r0 = i % 6 === 0 ? 2.75 : 2.88;
      dialPts.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * 3, Math.sin(a) * 3, 0);
    }
    this.dial = new Group();
    this.dial.add(noRaycast(new LineSegments(geometry(dialPts), new LineBasicMaterial({ color: 0x6d8fd0, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }))));
    this.dial.position.set(0, 0.6, -8);
    this.root.add(this.dial);
    this.root.traverse((o) => noRaycast(o));
    this.update(0, { calm: false, warp: false });
  }

  update(dt: number, s: DepthState): void {
    this.time += dt;
    // Speeds ease over about a second (no sudden acceleration).
    const want = s.calm ? (s.warp ? 0.12 : 0) : s.warp ? 0.85 : 0.05;
    this.speed += (want - this.speed) * Math.min(1, dt / 0.9);
    this.shift += this.speed * dt;
    this.sway += ((s.calm ? 0 : 1) - this.sway) * Math.min(1, dt / 1.5);

    // Streams: each point moves toward the user and wraps around at the far end; it fades in and out.
    const a = this.streamPos.array as Float32Array;
    const col = this.streamCol.array as Float32Array;
    const span = NEAR - FAR;
    for (let i = 0; i < STREAM * 2; i++) {
      const u = (this.streamBase[i * 3 + 2] + this.shift / span) % 1;
      a[i * 3] = this.streamBase[i * 3];
      a[i * 3 + 1] = this.streamBase[i * 3 + 1];
      a[i * 3 + 2] = FAR + u * span;
      // (Additive light: dimming the color fades the point in at the far end and out before the near end.)
      const fade = Math.min(1, u / 0.15) * Math.min(1, (1 - u) / 0.3);
      col[i * 3] = this.streamColor[i * 3] * fade;
      col[i * 3 + 1] = this.streamColor[i * 3 + 1] * fade;
      col[i * 3 + 2] = this.streamColor[i * 3 + 2] * fade;
    }
    this.streamPos.needsUpdate = true;
    this.streamCol.needsUpdate = true;
    this.streamMat.opacity = 0.35 + 0.35 * Math.min(1, this.speed / 0.85);

    // Glints sway a few centimeters sideways, each at its own pace.
    const g = this.glintPos.array as Float32Array;
    for (let i = 0; i < GLINTS; i++) {
      const w = this.glintPhase[i * 2 + 1];
      g[i * 3] = this.glintBase[i * 3] + Math.sin(this.time * w + this.glintPhase[i * 2]) * 0.06 * this.sway;
      g[i * 3 + 1] = this.glintBase[i * 3 + 1] + Math.sin(this.time * w * 0.7 + i) * 0.015 * this.sway;
    }
    this.glintPos.needsUpdate = true;

    // The dial turns a few degrees a minute (a quarter turn in the tunnel's few seconds).
    this.dial.rotation.z -= dt * (0.0012 * this.sway + 0.35 * Math.max(0, this.speed - 0.05) * (s.calm ? 0.2 : 1));
  }
}

/**
 * A few faint glints behind a band (band-local), drifting sideways while the
 * year flows (the way the timeline moves: toward the past, to the left), and
 * resting when it stops. Kept dim and behind the band's backing, so the text
 * in front stays clear.
 */
export class BandGlints {
  readonly points: Points;
  private readonly pos: BufferAttribute;
  private readonly base: Float32Array;
  private readonly width: number;
  private shift = 0;
  private speed = 0;

  constructor(width: number, height: number, count: number, behind: number, color = 0x9cc8ff) {
    this.width = width;
    this.base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.base[i * 3] = Math.random();
      this.base[i * 3 + 1] = (Math.random() - 0.5) * height;
      this.base[i * 3 + 2] = -behind - Math.random() * behind;
    }
    this.pos = new BufferAttribute(new Float32Array(count * 3), 3);
    const geo = new BufferGeometry();
    geo.setAttribute('position', this.pos);
    const mat = new PointsMaterial({ size: 0.012, map: haloTexture(), color, transparent: true, opacity: 0.28, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    this.points = noRaycast(new Points(geo, mat));
    this.points.frustumCulled = false;
    this.points.renderOrder = -1;
    this.update(0, false, false);
  }

  /** `flowing`: the year moves; `calm`: no drift. */
  update(dt: number, flowing: boolean, calm: boolean): void {
    const want = flowing && !calm ? 0.018 : 0;
    this.speed += (want - this.speed) * Math.min(1, dt / 1.2);
    this.shift += this.speed * dt;
    const a = this.pos.array as Float32Array;
    const n = this.base.length / 3;
    for (let i = 0; i < n; i++) {
      // Leftward (toward the past), wrapping at the band's edges.
      let u = (this.base[i * 3] - this.shift / this.width) % 1;
      if (u < 0) u += 1;
      a[i * 3] = (u - 0.5) * this.width;
      a[i * 3 + 1] = this.base[i * 3 + 1];
      a[i * 3 + 2] = this.base[i * 3 + 2];
    }
    this.pos.needsUpdate = true;
  }
}

function geometry(pts: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  return g;
}
