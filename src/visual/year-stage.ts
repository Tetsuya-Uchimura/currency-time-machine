/**
 * Year stage: the top band during a Year Journey. One canvas, four views,
 * each redrawn only when its content changes:
 *
 *   world    the year, its era, the places to watch, the year's events
 *   region   a place's leaders in the year (portraits, offices, terms), how it
 *            is governed, and its currency so far this year (never ahead of time)
 *   event    an event: date, place, summary, currencies, its sources
 *   summary  the year in one view: events, places, policymakers, the ranking of
 *            the year's changes (same period only), and where to go next
 *
 * Historical Portals (photos and decision makers) still open for the four
 * events that have one; the stage steps aside for them.
 */
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from '@iwsdk/core';
import { noRaycast, TextPlane } from './glow.js';
import { cachedImage, CanvasButton, roundRect, UiAction, wrapText } from './ui-button.js';

export interface StagePerson {
  name: string | null;
  title: string;
  term: string;
  portrait: string | null;
  credit: string | null;
}

export interface StageOffice {
  title: string;
  people: StagePerson[];
  gap: string | null;
}

export type StageView =
  | { kind: 'world'; year: number; era: string; eraText: string; places: { name: string; code: string; color: string }[]; events: { date: string; title: string }[]; note: string }
  | {
      kind: 'region';
      year: number;
      name: string;
      system: string;
      offices: StageOffice[];
      currency: { code: string; color: string; lines: string[] } | null;
      peopleHidden: boolean;
    }
  | { kind: 'event'; year: number; date: string; title: string; place: string; summary: string; currencies: { code: string; color: string }[]; places: string; sources: string; observed: string }
  | {
      kind: 'summary';
      year: number;
      period: string;
      events: { date: string; title: string }[];
      places: string[];
      people: string[];
      ranking: { code: string; color: string; pct: number }[];
      others: string[];
    };

const W = 1.74;
const H = 0.48;
const CANVAS_W = 2048;
const CONTENT_H = 0.335;

export class YearStage {
  readonly root = new Group();
  readonly buttons: CanvasButton[] = [];
  private readonly plate: MeshBasicMaterial;
  private readonly canvas: TextPlane;
  private view: StageView | null = null;
  private key = '';
  private shown = false;
  private opacity = 0;
  private dirty = false;
  /** Fades the stage while a Historical Portal shows the event. */
  yield = 0;

  constructor() {
    this.plate = new MeshBasicMaterial({ color: 0x050a16, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const plate = noRaycast(new Mesh(new PlaneGeometry(W, H), this.plate));
    plate.position.z = -0.004;
    this.root.add(plate);
    this.canvas = new TextPlane(W - 0.04, CONTENT_H, Math.round((CANVAS_W * CONTENT_H) / (W - 0.04)));
    this.canvas.mesh.position.set(0, 0.235 - CONTENT_H / 2, 0.002);
    this.root.add(this.canvas.mesh);
    // Summary actions (shown with the summary view).
    const actions: [number, string, string, number][] = [
      [UiAction.AnotherYear, 'Explore another year', 'primary', 0.3],
      [UiAction.PrevYear, '◀  Previous year', 'secondary', 0.22],
      [UiAction.NextYear, 'Next year  ▶', 'secondary', 0.22],
      [UiAction.Replay, 'Replay this year', 'secondary', 0.22],
      [UiAction.FullJourney, 'Full Journey', 'ghost', 0.2],
    ];
    let x = -0.83;
    for (const [action, label, style, w] of actions) {
      const b = new CanvasButton(w, 0.06, action, label, style as 'primary');
      b.mesh.position.set(x + w / 2, -0.123, 0.006);
      x += w + 0.025;
      b.setShown(false);
      this.root.add(b.mesh);
      this.buttons.push(b);
    }
  }

  setShown(on: boolean): void {
    this.shown = on;
    const summary = on && this.view?.kind === 'summary';
    for (const b of this.buttons) b.setShown(summary);
  }

  get visibility(): number {
    return this.opacity * (1 - this.yield);
  }

  get viewKind(): string {
    return this.view?.kind ?? '';
  }

  show(view: StageView): void {
    this.view = view;
    const summary = this.shown && view.kind === 'summary';
    for (const b of this.buttons) b.setShown(summary);
    this.redraw();
  }

  /** Enable or disable the previous/next buttons at the ends of the data. */
  setNav(hasPrev: boolean, hasNext: boolean): void {
    for (const b of this.buttons) {
      if (b.action === UiAction.PrevYear) b.setEnabled(hasPrev);
      if (b.action === UiAction.NextYear) b.setEnabled(hasNext);
    }
  }

  private redraw(): void {
    const v = this.view;
    if (!v) return;
    const key = JSON.stringify(v);
    if (key === this.key && !this.dirty) return;
    this.key = key;
    this.dirty = false;
    const onLoad = () => {
      this.dirty = true;
    };
    this.canvas.draw(key + Math.random(), (ctx, w, h) => {
      switch (v.kind) {
        case 'world':
          drawWorld(ctx, w, h, v);
          break;
        case 'region':
          drawRegion(ctx, w, h, v, onLoad);
          break;
        case 'event':
          drawEvent(ctx, w, h, v);
          break;
        case 'summary':
          drawSummary(ctx, w, h, v);
          break;
      }
    });
  }

  update(dt: number): void {
    if (this.dirty) this.redraw();
    this.opacity += ((this.shown ? 1 : 0) - this.opacity) * Math.min(1, dt / 0.35);
    const o = this.opacity * (1 - this.yield);
    this.root.visible = o > 0.01;
    this.plate.opacity = 0.62 * o;
    this.canvas.mat.opacity = o;
    for (const b of this.buttons) b.update(dt, o);
  }
}

// ---------------------------------------------------------------------------
// Views (canvas units: the content area is 2048 px wide)
// ---------------------------------------------------------------------------

const FONT = 'system-ui, sans-serif';

function heading(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = '#ffffff', weight = 700): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function para(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, lines: number, color = '#dbe6f5', lh = 1.28): number {
  ctx.font = `${size}px ${FONT}`;
  ctx.fillStyle = color;
  const out = wrapText(ctx, text, maxW, lines);
  out.forEach((l, k) => ctx.fillText(l, x, y + k * size * lh));
  return y + out.length * size * lh;
}

function chip(ctx: CanvasRenderingContext2D, code: string, color: string, x: number, y: number, size = 26): number {
  ctx.font = `700 ${size}px ${FONT}`;
  const w = ctx.measureText(code).width + 26;
  roundRect(ctx, x, y - size, w, size * 1.4, size * 0.4);
  ctx.fillStyle = 'rgba(10,20,38,0.9)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(code, x + 13, y);
  return x + w + 12;
}

function drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, v: Extract<StageView, { kind: 'world' }>): void {
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(255,190,90,0.55)';
  ctx.shadowBlur = 18;
  heading(ctx, String(v.year), 30, 200, 200, '#ffe1a0', 800);
  ctx.shadowBlur = 0;
  heading(ctx, v.era, 34, 262, 40, '#9fd8ff', 700);
  para(ctx, v.eraText, 34, 310, 600, 30, 3, '#c9d6ea');
  // Places to watch.
  heading(ctx, 'PLACES TO WATCH', 700, 62, 30, '#9fd8ff', 700);
  v.places.forEach((p, k) => {
    const y = 136 + k * 84;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(720, y - 17, 16, 0, Math.PI * 2);
    ctx.fill();
    heading(ctx, p.name, 752, y, 50, '#ffffff', 700);
    heading(ctx, p.code, 752 + ctx.measureText(p.name).width + 20, y, 36, p.color, 700);
  });
  // Events this year.
  heading(ctx, 'THIS YEAR', 1300, 62, 30, '#9fd8ff', 700);
  if (!v.events.length) para(ctx, 'No verified event recorded for this year.', 1300, 124, 700, 34, 3, '#c9d6ea');
  v.events.slice(0, 4).forEach((e, k) => {
    const y = 128 + k * 74;
    heading(ctx, e.date, 1300, y, 30, '#ffd27a', 700);
    ctx.font = `600 36px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(e.title, 1300, y + 38, w - 1320);
  });
  if (v.note) para(ctx, v.note, 700, h - 24, w - 730, 24, 1, '#8fa5c6');
}

function drawPortrait(ctx: CanvasRenderingContext2D, p: StagePerson, x: number, y: number, size: number, onLoad: () => void): void {
  roundRect(ctx, x, y, size, size, 16);
  ctx.save();
  ctx.clip();
  const img = p.portrait ? cachedImage(p.portrait, onLoad) : null;
  if (img) ctx.drawImage(img, x, y, size, size);
  else {
    const g = ctx.createLinearGradient(x, y, x, y + size);
    g.addColorStop(0, '#22385e');
    g.addColorStop(1, '#0d1830');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#9fc4ee';
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(size * 0.34)}px ${FONT}`;
    const initials = p.name
      ? p.name
          .split(/\s+/)
          .filter((s) => /^[A-Z]/.test(s))
          .map((s) => s[0])
          .slice(0, 2)
          .join('')
      : '?';
    ctx.fillText(initials, x + size / 2, y + size * 0.62);
    ctx.textAlign = 'left';
  }
  ctx.restore();
  roundRect(ctx, x, y, size, size, 16);
  ctx.strokeStyle = 'rgba(160,210,255,0.55)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawRegion(ctx: CanvasRenderingContext2D, w: number, h: number, v: Extract<StageView, { kind: 'region' }>, onLoad: () => void): void {
  ctx.textBaseline = 'alphabetic';
  heading(ctx, v.name, 30, 72, 64, '#ffffff', 800);
  heading(ctx, String(v.year), 30 + ctx.measureText(v.name).width + 22, 72, 46, '#ffd27a', 700);
  para(ctx, v.system, 32, 118, 1500, 30, 1, '#9fb8d8');
  // Office cards: portrait, name(s), office, term.
  let x = 30;
  const top = 146;
  const size = 176;
  for (const o of v.offices.slice(0, 3)) {
    const cardW = o.people.length > 1 && !v.peopleHidden ? 560 : 500;
    if (x + cardW > 1400) break;
    roundRect(ctx, x, top, cardW, h - top - 14, 18);
    ctx.fillStyle = 'rgba(14,26,48,0.82)';
    ctx.fill();
    ctx.font = '700 24px ' + FONT;
    ctx.fillStyle = '#9fd8ff';
    ctx.fillText(o.title.toUpperCase(), x + 18, top + 36, cardW - 36);
    if (v.peopleHidden) {
      para(ctx, 'Names and portraits are not shown in this version.', x + 18, top + 84, cardW - 36, 30, 3, '#c9d6ea');
    } else if (!o.people.length) {
      para(ctx, o.gap ?? 'No verified record for this year.', x + 18, top + 84, cardW - 36, 30, 3, '#c9d6ea');
    } else {
      const people = o.people.slice(0, 2);
      const ps = people.length > 1 ? 128 : size;
      people.forEach((p, k) => {
        const px = x + 18 + k * (ps + 140);
        drawPortrait(ctx, p, px, top + 52, ps, onLoad);
        const tx = people.length > 1 ? px : px + ps + 22;
        const ty = people.length > 1 ? top + 52 + ps + 36 : top + 100;
        const nameSize = people.length > 1 ? 28 : 38;
        ctx.font = '700 ' + nameSize + 'px ' + FONT;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.name ?? '', tx, ty, people.length > 1 ? ps + 130 : cardW - ps - 60);
        heading(ctx, p.term, tx, ty + (people.length > 1 ? 32 : 46), people.length > 1 ? 24 : 30, '#ffd27a', 600);
        if (people.length === 1 && p.credit) para(ctx, p.credit, tx, top + 52 + ps - 22, cardW - ps - 60, 17, 2, '#7f93b3', 1.2);
      });
      if (o.gap) para(ctx, o.gap, x + 18, h - 26, cardW - 36, 20, 1, '#8fa5c6');
    }
    x += cardW + 22;
  }
  // The currency so far this year (live: never ahead of the playhead).
  if (v.currency) {
    const cx = Math.max(x, 1450);
    roundRect(ctx, cx, top, w - cx - 20, h - top - 14, 18);
    ctx.fillStyle = 'rgba(14,26,48,0.82)';
    ctx.fill();
    heading(ctx, 'CURRENCY', cx + 20, top + 36, 24, '#9fd8ff', 700);
    heading(ctx, v.currency.code, cx + 20, top + 96, 54, v.currency.color, 800);
    let y = top + 140;
    for (const line of v.currency.lines) y = para(ctx, line, cx + 20, y, w - cx - 60, 28, 2, '#e4ecf8', 1.2) + 4;
  }
}

function drawEvent(ctx: CanvasRenderingContext2D, w: number, h: number, v: Extract<StageView, { kind: 'event' }>): void {
  ctx.textBaseline = 'alphabetic';
  heading(ctx, v.date.toUpperCase(), 32, 64, 34, '#ffd27a', 800);
  ctx.font = `800 58px ${FONT}`;
  const titleLines = wrapText(ctx, v.title, 760, 2);
  titleLines.forEach((l, k) => heading(ctx, l, 30, 136 + k * 64, 58, '#ffffff', 800));
  heading(ctx, v.place, 32, 136 + titleLines.length * 64 + 8, 28, '#9fd8ff', 600);
  para(ctx, v.summary, 860, 70, 1150, 34, 4, '#eef4fc');
  let x = 860;
  heading(ctx, 'CURRENCIES TO WATCH', 860, 250, 20, '#9fd8ff', 700);
  for (const c of v.currencies) x = chip(ctx, c.code, c.color, x, 300);
  para(ctx, v.places, 860, 352, 1150, 22, 1, '#a9c4e4');
  // The event's date and the rates' date are different things: say which week the bands show.
  para(ctx, v.observed, 32, h - 86, 800, 24, 2, '#e8f0fb');
  para(ctx, `Source: ${v.sources}`, 32, h - 22, w - 64, 21, 1, '#9fb3d1');
}

function drawSummary(ctx: CanvasRenderingContext2D, w: number, h: number, v: Extract<StageView, { kind: 'summary' }>): void {
  ctx.textBaseline = 'alphabetic';
  heading(ctx, String(v.year), 30, 118, 120, '#ffe1a0', 800);
  heading(ctx, 'YEAR IN REVIEW', 34, 160, 28, '#9fd8ff', 700);
  let y = 210;
  v.events.slice(0, 3).forEach((e) => {
    heading(ctx, e.date, 34, y, 26, '#ffd27a', 700);
    ctx.font = '600 28px ' + FONT;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(e.title, 34, y + 32, 600);
    y += 72;
  });
  if (!v.events.length) para(ctx, 'No verified event recorded.', 34, y, 600, 28, 1, '#c9d6ea');
  // Ranking: change in value vs USD over the same period.
  const x0 = 680;
  heading(ctx, 'CHANGE VS US DOLLAR', x0, 44, 28, '#9fd8ff', 700);
  para(ctx, v.period, x0 + 370, 44, 480, 24, 1, '#8fa5c6');
  const rows = v.ranking.slice(0, 9);
  const maxAbs = Math.max(2, ...rows.map((r) => Math.abs(r.pct)));
  const mid = x0 + 380;
  const half = 300;
  const rowH = Math.min(35, (h - 100) / Math.max(1, rows.length));
  ctx.strokeStyle = 'rgba(200,215,240,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mid, 60);
  ctx.lineTo(mid, 66 + rows.length * rowH);
  ctx.stroke();
  rows.forEach((r, k) => {
    const yy = 66 + k * rowH;
    const len = (Math.abs(r.pct) / maxAbs) * half;
    ctx.fillStyle = r.color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(r.pct >= 0 ? mid : mid - len, yy + 4, len, rowH - 8);
    ctx.globalAlpha = 1;
    heading(ctx, r.code, x0, yy + rowH * 0.72, Math.round(rowH * 0.66), r.color, 700);
    const label = `${r.pct >= 0 ? '▲ +' : '▼ −'}${Math.abs(r.pct).toFixed(1)}%`;
    heading(ctx, label, r.pct >= 0 ? mid + len + 10 : mid + 10, yy + rowH * 0.72, Math.round(rowH * 0.6), '#ffffff', 600);
  });
  if (v.others.length) para(ctx, v.others.join('  ·  '), x0, h - 14, 800, 22, 1, '#8fa5c6');
  // Places and people.
  const x1 = 1500;
  heading(ctx, 'PLACES', x1, 44, 28, '#9fd8ff', 700);
  para(ctx, v.places.join(', '), x1, 84, w - x1 - 24, 30, 2, '#ffffff');
  heading(ctx, 'KEY POLICYMAKERS', x1, 170, 28, '#9fd8ff', 700);
  let py = 208;
  for (const p of v.people.slice(0, 6)) {
    py = para(ctx, p, x1, py, w - x1 - 24, 24, 1, '#dbe6f5', 1.2) + 6;
  }
}
