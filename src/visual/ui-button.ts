/**
 * Buttons drawn on canvas planes, for the Year Journey's panels (year
 * selector, summary). Each carries a UiTarget component with its action, so
 * one ECS query handles pinch (ray) and touch (poke) for all of them, and the
 * IWSDK Hovered tag lights them up.
 *
 * Sizes: at the top band (1.4 m) a 12 cm button is about 5 degrees wide, an
 * easy target for a hand ray.
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

/** Actions understood by the experience (UiTarget.action). */
export const UiAction = {
  StartTravel: 1,
  YearMinus1: 2,
  YearPlus1: 3,
  YearMinus10: 4,
  YearPlus10: 5,
  /** Quick years: QuickYear + index into the quick list. */
  QuickYear: 10,
  /** Decades: Decade + index into the decade list. */
  Decade: 20,
  FullJourney: 40,
  AnotherYear: 41,
  PrevYear: 42,
  NextYear: 43,
  Replay: 44,
  Calm: 45,
  AllCurrencies: 46,
  SkipIntro: 47,
} as const;

export type ButtonStyle = 'primary' | 'secondary' | 'chip' | 'ghost';

const STYLE: Record<ButtonStyle, { bg: string; bgHover: string; fg: string; border: string }> = {
  primary: { bg: 'rgba(255,196,92,0.92)', bgHover: 'rgba(255,214,140,1)', fg: '#1a1205', border: 'rgba(255,236,190,0.9)' },
  secondary: { bg: 'rgba(28,46,80,0.92)', bgHover: 'rgba(48,82,138,0.98)', fg: '#eaf3ff', border: 'rgba(120,200,255,0.55)' },
  chip: { bg: 'rgba(12,24,44,0.88)', bgHover: 'rgba(36,70,118,0.96)', fg: '#d8ecff', border: 'rgba(110,190,255,0.4)' },
  ghost: { bg: 'rgba(6,12,24,0.6)', bgHover: 'rgba(30,56,96,0.9)', fg: '#b9cce6', border: 'rgba(110,160,220,0.3)' },
};

export class CanvasButton {
  readonly mesh: Mesh;
  readonly action: number;
  private readonly mat: MeshBasicMaterial;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private label: string;
  private sub: string;
  private style: ButtonStyle;
  private hovered = false;
  private selected = false;
  private enabled = true;
  private shown = true;
  private opacity = 0;
  private key = '';

  constructor(w: number, h: number, action: number, label: string, style: ButtonStyle = 'secondary', sub = '') {
    this.action = action;
    this.label = label;
    this.sub = sub;
    this.style = style;
    const px = 96;
    this.canvas.width = Math.round((px * w) / h);
    this.canvas.height = px;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
    this.mesh = new Mesh(new PlaneGeometry(w, h), this.mat);
    this.mesh.name = `ui-${action}`;
    this.mesh.renderOrder = 12;
    this.redraw();
  }

  set(label: string, sub = this.sub, style: ButtonStyle = this.style): void {
    this.label = label;
    this.sub = sub;
    this.style = style;
    this.redraw();
  }

  setHover(on: boolean): void {
    if (this.hovered === on) return;
    this.hovered = on;
    this.redraw();
  }

  setSelected(on: boolean): void {
    if (this.selected === on) return;
    this.selected = on;
    this.redraw();
  }

  setEnabled(on: boolean): void {
    if (this.enabled === on) return;
    this.enabled = on;
    this.redraw();
  }

  /** Shown buttons fade in and take hits; hidden ones fade out and ignore rays. */
  setShown(on: boolean): void {
    this.shown = on;
  }

  get isActive(): boolean {
    return this.shown && this.enabled && this.opacity > 0.5;
  }

  update(dt: number, parentOpacity = 1): void {
    const target = this.shown ? (this.enabled ? 1 : 0.4) : 0;
    this.opacity += (target - this.opacity) * Math.min(1, dt / 0.2);
    this.mat.opacity = this.opacity * parentOpacity;
    this.mesh.visible = this.mat.opacity > 0.01;
    // Rays only hit active buttons (Mesh.prototype.raycast restored when shown).
    this.mesh.raycast = this.isActive && parentOpacity > 0.5 ? Mesh.prototype.raycast : () => {};
  }

  private redraw(): void {
    const key = `${this.label}|${this.sub}|${this.style}|${this.hovered}|${this.selected}|${this.enabled}`;
    if (key === this.key) return;
    this.key = key;
    const ctx = this.canvas.getContext('2d')!;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const st = STYLE[this.style];
    ctx.clearRect(0, 0, w, h);
    const r = h * 0.28;
    roundRect(ctx, 3, 3, w - 6, h - 6, r);
    ctx.fillStyle = this.hovered || this.selected ? st.bgHover : st.bg;
    ctx.fill();
    ctx.lineWidth = this.selected ? 5 : this.hovered ? 4 : 2;
    ctx.strokeStyle = this.selected ? '#ffd27a' : this.hovered ? '#9fe8ff' : st.border;
    ctx.stroke();
    ctx.fillStyle = st.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.sub) {
      ctx.font = `700 ${Math.round(h * 0.4)}px system-ui, sans-serif`;
      ctx.fillText(this.label, w / 2, h * 0.38, w - 16);
      ctx.font = `${Math.round(h * 0.24)}px system-ui, sans-serif`;
      ctx.globalAlpha = 0.85;
      ctx.fillText(this.sub, w / 2, h * 0.75, w - 16);
      ctx.globalAlpha = 1;
    } else {
      ctx.font = `700 ${Math.round(h * 0.46)}px system-ui, sans-serif`;
      ctx.fillText(this.label, w / 2, h / 2 + 1, w - 16);
    }
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Greedy word wrap to a width; at most `maxLines` (the last gets an ellipsis). */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines = 99): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    let last = cut[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    cut[maxLines - 1] = last.replace(/[\s,;:.]+$/, '') + '…';
    return cut;
  }
  return lines;
}

/** Simple image cache for canvas drawing (portraits, photos). */
const images = new Map<string, HTMLImageElement>();
export function cachedImage(src: string, onLoad: () => void): HTMLImageElement | null {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = onLoad;
    img.src = src;
    images.set(src, img);
    return null;
  }
  if (!img.complete || img.naturalWidth === 0) {
    const prev = img.onload;
    img.onload = (ev) => {
      if (typeof prev === 'function') prev.call(img!, ev);
      onLoad();
    };
    return null;
  }
  return img;
}
