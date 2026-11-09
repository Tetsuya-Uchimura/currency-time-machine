/**
 * City painter: code-generated city impressions for the Historical Portals.
 *
 * These are artistic impressions, not records: generic silhouettes (low-rise
 * capital with an obelisk and a dome; dense 1980s blocks with a lattice tower;
 * apartment slabs below mountains with a hilltop tower and a river bridge;
 * stepped skyscrapers with a suspension bridge). No people, no text, no logos.
 * The window labels them "Artistic impression, not a photograph".
 *
 * Each scene is painted as three layers (sky, city, foreground) on separate
 * canvases, so the window can place them at slightly different depths for a
 * gentle, honest 2.5D parallax. A seeded random generator keeps every scene
 * identical from run to run.
 */
import type { CityStyle } from '../data/portals.js';

export const LAYER_W = 1024;
export const LAYER_H = 576;

export interface CityLayers {
  sky: HTMLCanvasElement;
  city: HTMLCanvasElement;
  front: HTMLCanvasElement;
}

type Ctx = CanvasRenderingContext2D;
type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = LAYER_W;
  c.height = LAYER_H;
  return [c, c.getContext('2d')!];
}

function gradientSky(ctx: Ctx, stops: [number, string][]): void {
  const g = ctx.createLinearGradient(0, 0, 0, LAYER_H);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LAYER_W, LAYER_H);
}

function stars(ctx: Ctx, rng: Rng, n: number, maxY: number, alpha: number): void {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(220,230,255,${alpha * (0.3 + 0.7 * rng())})`;
    const s = rng() < 0.85 ? 1 : 2;
    ctx.fillRect(rng() * LAYER_W, rng() * maxY, s, s);
  }
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.globalAlpha = 1;
}

interface WindowStyle {
  colors: string[];
  /** Probability that a window is lit. */
  lit: number;
  cell: [number, number];
  size: [number, number];
}

/** One building block with a grid of (some) lit windows. */
function block(ctx: Ctx, rng: Rng, x: number, w: number, top: number, base: number, body: string, win: WindowStyle | null): void {
  ctx.fillStyle = body;
  ctx.fillRect(x, top, w, base - top);
  if (!win) return;
  const [cw, ch] = win.cell;
  const [sw, sh] = win.size;
  for (let y = top + 5; y < base - sh - 2; y += ch) {
    for (let xx = x + 3; xx < x + w - sw - 2; xx += cw) {
      if (rng() > win.lit) continue;
      ctx.globalAlpha = 0.55 + 0.45 * rng();
      ctx.fillStyle = win.colors[Math.floor(rng() * win.colors.length)];
      ctx.fillRect(xx, y, sw, sh);
    }
  }
  ctx.globalAlpha = 1;
}

/** A row of blocks across the width. */
function skyline(
  ctx: Ctx,
  rng: Rng,
  base: number,
  heights: [number, number],
  widths: [number, number],
  body: string,
  win: WindowStyle | null,
  gap = 2,
): void {
  let x = -10;
  while (x < LAYER_W + 10) {
    const w = widths[0] + rng() * (widths[1] - widths[0]);
    const h = heights[0] + Math.pow(rng(), 1.6) * (heights[1] - heights[0]);
    block(ctx, rng, x, w, base - h, base, body, win);
    x += w + gap * rng();
  }
}

/** A smooth random ridge line, filled down to the bottom. */
function ridge(ctx: Ctx, rng: Rng, baseY: number, amp: number, color: string, peaks: number): void {
  const pts: number[] = [];
  const phase = rng() * 10;
  for (let x = 0; x <= LAYER_W; x += 8) {
    const u = x / LAYER_W;
    let y = 0;
    for (let k = 1; k <= 3; k++) y += Math.sin(u * Math.PI * peaks * k + phase * k) / (k * 1.4);
    pts.push(baseY - amp * (0.55 + 0.45 * y));
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, LAYER_H);
  pts.forEach((y, i) => ctx.lineTo(i * 8, y));
  ctx.lineTo(LAYER_W, LAYER_H);
  ctx.closePath();
  ctx.fill();
}

/** Vertical light streaks on water below `y` (reflections of the city). */
function reflections(ctx: Ctx, rng: Rng, y: number, colors: string[], n: number): void {
  for (let i = 0; i < n; i++) {
    const x = rng() * LAYER_W;
    const len = 8 + rng() * 40;
    ctx.globalAlpha = 0.08 + 0.18 * rng();
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.fillRect(x, y + 4 + rng() * 30, 1 + rng() * 2, len);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

function washington(rng: Rng): CityLayers {
  const [sky, s] = canvas();
  gradientSky(s, [
    [0, '#060b17'],
    [0.55, '#17223a'],
    [0.82, '#33425e'],
    [1, '#3d4c68'],
  ]);
  stars(s, rng, 140, LAYER_H * 0.5, 0.6);
  glow(s, LAYER_W * 0.5, LAYER_H * 0.82, 380, 'rgba(110,130,170,1)', 0.25);

  const [city, c] = canvas();
  const base = LAYER_H * 0.8;
  const win: WindowStyle = { colors: ['#ffd9a0', '#ffe8c4', '#f6c27a'], lit: 0.22, cell: [9, 11], size: [4, 5] };
  // A capital with a height limit: long, low blocks.
  skyline(c, rng, base, [26, 70], [50, 140], '#141c2e', win, 6);
  // Obelisk.
  const ox = LAYER_W * 0.36;
  c.fillStyle = '#1b2740';
  c.beginPath();
  c.moveTo(ox - 14, base);
  c.lineTo(ox - 9, base - 300);
  c.lineTo(ox, base - 322);
  c.lineTo(ox + 9, base - 300);
  c.lineTo(ox + 14, base);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(150,170,210,0.35)';
  c.fillRect(ox + 5, base - 298, 2, 296); // moonlit edge
  c.fillStyle = 'rgba(255,90,80,0.9)';
  c.fillRect(ox - 1, base - 312, 3, 3); // aircraft warning light
  // Domed building.
  const dx = LAYER_W * 0.72;
  c.fillStyle = '#18213a';
  c.fillRect(dx - 150, base - 58, 300, 58);
  c.fillRect(dx - 58, base - 104, 116, 48);
  c.beginPath();
  c.ellipse(dx, base - 104, 60, 66, 0, Math.PI, 0);
  c.fill();
  c.fillRect(dx - 7, base - 186, 14, 20);
  c.beginPath();
  c.ellipse(dx, base - 186, 8, 9, 0, Math.PI, 0);
  c.fill();
  for (let k = -5; k <= 5; k++) {
    c.fillStyle = 'rgba(255,214,150,0.55)';
    c.fillRect(dx + k * 9 - 1, base - 98, 3, 36); // columns catching light
  }

  const [front, f] = canvas();
  // Trees and a reflecting pool in the foreground.
  ridge(f, rng, LAYER_H * 0.93, 22, '#05080f', 18);
  f.fillStyle = 'rgba(120,140,190,0.22)';
  f.fillRect(LAYER_W * 0.18, LAYER_H * 0.86, LAYER_W * 0.38, 5);
  for (let x = 20; x < LAYER_W; x += 46 + rng() * 20) glow(f, x, LAYER_H * 0.9, 10, 'rgba(255,200,120,1)', 0.55);
  return { sky, city, front };
}

function tokyo(rng: Rng): CityLayers {
  const [sky, s] = canvas();
  gradientSky(s, [
    [0, '#1a0f2e'],
    [0.38, '#4f2140'],
    [0.66, '#b4523c'],
    [0.84, '#ec9a52'],
    [1, '#f3b066'],
  ]);
  glow(s, LAYER_W * 0.28, LAYER_H * 0.8, 150, 'rgba(255,214,140,1)', 0.75);
  stars(s, rng, 40, LAYER_H * 0.25, 0.4);

  const [city, c] = canvas();
  const base = LAYER_H * 0.84;
  const warm: WindowStyle = { colors: ['#ffd08a', '#ffe2b0', '#7fdcff', '#ff9fc8'], lit: 0.38, cell: [7, 9], size: [3, 4] };
  skyline(c, rng, base - 30, [70, 200], [28, 74], '#2a1726', warm, 2);
  // Lattice tower.
  const tx = LAYER_W * 0.62;
  const h = 360;
  const top = base - 30 - h;
  c.strokeStyle = 'rgba(255,128,80,0.95)';
  c.lineWidth = 2;
  // Half-width of the tapering tower at height y (wide legs, slim top).
  const halfAt = (y: number) => 3 + 46 * Math.pow(Math.min(1, Math.max(0, 1 - (base - 30 - y) / h)), 1.6);
  c.beginPath();
  for (let y = base - 30; y > top + 40; y -= 22) {
    const a = halfAt(y);
    const b = halfAt(y - 22);
    c.moveTo(tx - a, y);
    c.lineTo(tx + b, y - 22);
    c.moveTo(tx + a, y);
    c.lineTo(tx - b, y - 22);
    c.moveTo(tx - a, y);
    c.lineTo(tx + a, y);
  }
  c.moveTo(tx - halfAt(base - 30), base - 30);
  c.lineTo(tx - 3, top + 40);
  c.moveTo(tx + halfAt(base - 30), base - 30);
  c.lineTo(tx + 3, top + 40);
  c.stroke();
  c.fillStyle = 'rgba(255,170,110,0.95)';
  for (const f of [0.42, 0.72]) {
    const y = base - 30 - h * f;
    const a = halfAt(y) + 6;
    c.fillRect(tx - a, y - 8, 2 * a, 9);
  }
  c.fillRect(tx - 1, top, 2, 44);
  c.fillStyle = 'rgba(255,90,80,1)';
  c.fillRect(tx - 1.5, top - 2, 3, 3);

  const [front, f] = canvas();
  skyline(f, rng, LAYER_H, [40, 120], [30, 70], '#140a16', warm, 1);
  // Elevated railway with a passing lit train.
  const ry = LAYER_H * 0.86;
  f.fillStyle = '#0b0610';
  f.fillRect(0, ry, LAYER_W, 9);
  for (let x = 30; x < LAYER_W; x += 90) f.fillRect(x, ry, 8, LAYER_H - ry);
  f.fillStyle = 'rgba(255,224,170,0.9)';
  for (let x = LAYER_W * 0.15; x < LAYER_W * 0.48; x += 14) f.fillRect(x, ry - 7, 9, 4);
  f.fillStyle = '#0d0812';
  f.fillRect(LAYER_W * 0.145, ry - 10, LAYER_W * 0.34, 3);
  return { sky, city, front };
}

function seoul(rng: Rng): CityLayers {
  const [sky, s] = canvas();
  gradientSky(s, [
    [0, '#0b0715'],
    [0.5, '#25122a'],
    [0.8, '#53202d'],
    [1, '#6a2a30'],
  ]);
  stars(s, rng, 70, LAYER_H * 0.4, 0.5);
  ridge(s, rng, LAYER_H * 0.62, 120, '#3e2645', 2.2);

  const [city, c] = canvas();
  ridge(c, rng, LAYER_H * 0.7, 90, '#2a1830', 1.6);
  // Hilltop tower on the nearer ridge.
  const tx = LAYER_W * 0.56;
  const ty = LAYER_H * 0.7 - 120;
  c.fillStyle = '#2a1830';
  c.beginPath();
  c.ellipse(tx, ty + 70, 120, 60, 0, Math.PI, 0);
  c.fill();
  c.fillStyle = '#2b1a2e';
  c.fillRect(tx - 4, ty - 70, 8, 120);
  c.beginPath();
  c.ellipse(tx, ty - 60, 16, 7, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255,220,200,0.8)';
  c.fillRect(tx - 14, ty - 61, 28, 2);
  c.fillStyle = '#2b1a2e';
  c.fillRect(tx - 1, ty - 112, 2, 44);
  c.fillStyle = 'rgba(255,80,80,1)';
  c.fillRect(tx - 1.5, ty - 114, 3, 3);
  // Apartment slabs with regular windows.
  const base = LAYER_H * 0.8;
  const cool: WindowStyle = { colors: ['#e2ebff', '#ffe6c0', '#cfd9f5'], lit: 0.45, cell: [8, 9], size: [4, 3] };
  skyline(c, rng, base, [60, 170], [60, 120], '#190e1b', cool, 14);

  const [front, f] = canvas();
  // River with a long bridge and reflections.
  const ry = LAYER_H * 0.82;
  f.fillStyle = '#07050b';
  f.fillRect(0, ry, LAYER_W, LAYER_H - ry);
  reflections(f, rng, ry, ['#e2ebff', '#ffd9a8', '#ff9a9a'], 260);
  f.strokeStyle = '#2a1a28';
  f.lineWidth = 4;
  f.beginPath();
  for (let x = -40; x < LAYER_W + 40; x += 110) {
    f.moveTo(x, ry + 34);
    f.quadraticCurveTo(x + 55, ry + 2, x + 110, ry + 34);
  }
  f.stroke();
  f.fillStyle = '#21141f';
  f.fillRect(0, ry - 6, LAYER_W, 8);
  for (let x = 6; x < LAYER_W; x += 24) glow(f, x, ry - 6, 7, 'rgba(255,214,150,1)', 0.75);
  return { sky, city, front };
}

function newYork(rng: Rng): CityLayers {
  const [sky, s] = canvas();
  gradientSky(s, [
    [0, '#02050c'],
    [0.55, '#0b1424'],
    [0.85, '#24182a'],
    [1, '#3a1c26'],
  ]);
  stars(s, rng, 50, LAYER_H * 0.35, 0.35);
  glow(s, LAYER_W * 0.55, LAYER_H * 0.95, 420, 'rgba(120,40,50,1)', 0.35);

  const [city, c] = canvas();
  const base = LAYER_H * 0.82;
  const cold: WindowStyle = { colors: ['#d6e4ff', '#eef3ff', '#b8ccf0', '#ffe2b8'], lit: 0.5, cell: [6, 8], size: [3, 4] };
  // Stepped towers, some with spires.
  let x = -10;
  while (x < LAYER_W + 10) {
    const w = 22 + rng() * 50;
    const h = 120 + Math.pow(rng(), 1.3) * 300;
    let top = base - h;
    block(c, rng, x, w, top, base, '#0c1422', cold);
    if (rng() < 0.45) {
      const w2 = w * 0.6;
      const h2 = 20 + rng() * 60;
      block(c, rng, x + (w - w2) / 2, w2, top - h2, top, '#0c1422', cold);
      top -= h2;
      if (rng() < 0.4) {
        c.fillStyle = '#0c1422';
        c.beginPath();
        c.moveTo(x + w / 2 - w2 / 4, top);
        c.lineTo(x + w / 2, top - 40 - rng() * 50);
        c.lineTo(x + w / 2 + w2 / 4, top);
        c.fill();
      }
    }
    x += w + 1 + rng() * 3;
  }

  const [front, f] = canvas();
  // Waterfront and a suspension bridge on the left.
  const wy = LAYER_H * 0.86;
  f.fillStyle = '#03060c';
  f.fillRect(0, wy, LAYER_W, LAYER_H - wy);
  reflections(f, rng, wy, ['#d6e4ff', '#ffe2b8', '#ff8a8a'], 300);
  f.fillStyle = '#0a1018';
  f.fillRect(0, wy - 30, LAYER_W * 0.42, 6);
  for (const tx of [LAYER_W * 0.08, LAYER_W * 0.34]) f.fillRect(tx - 6, wy - 130, 12, 106);
  f.strokeStyle = 'rgba(190,210,255,0.55)';
  f.lineWidth = 1.5;
  f.beginPath();
  f.moveTo(-40, wy - 70);
  f.quadraticCurveTo(LAYER_W * 0.0, wy - 60, LAYER_W * 0.08, wy - 128);
  f.quadraticCurveTo(LAYER_W * 0.21, wy - 30, LAYER_W * 0.34, wy - 128);
  f.quadraticCurveTo(LAYER_W * 0.4, wy - 70, LAYER_W * 0.46, wy - 34);
  f.stroke();
  for (let xx = 0; xx < LAYER_W * 0.42; xx += 12) glow(f, xx, wy - 28, 5, 'rgba(255,230,190,1)', 0.7);
  return { sky, city, front };
}

const PAINTERS: Record<CityStyle, (rng: Rng) => CityLayers> = {
  'washington-1971': washington,
  'tokyo-1985': tokyo,
  'seoul-1997': seoul,
  'newyork-2008': newYork,
};

/** Paint the three layers of a city impression (deterministic per style). */
export function paintCity(style: CityStyle): CityLayers {
  const seed = [...style].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return PAINTERS[style](mulberry32(seed));
}
