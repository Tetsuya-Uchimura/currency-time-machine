/**
 * Year selector (top band, Year Journey): pick any year with data, see what
 * happened in it, then Start Travel.
 *
 *   decades   1948 1950s ... 2020s          (jump to a decade)
 *   dial      [-10] [-1]   1985   [+1] [+10]
 *   famous    1971 1985 1997 2008 2022       (quick access, with their story)
 *   preview   the year's verified events: date, title, places, currencies
 *   actions   [Start Travel]  [Full Journey]  [Calm motion]
 *
 * Every control is a CanvasButton (pinch from the seat, or touch); the hand
 * panel repeats the dial and Start Travel within reach for poking.
 * Band-local meters (the events band: 1.74 x 0.48 m; the bottom strip is
 * left to the guide's subtitles).
 */
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from '@iwsdk/core';
import { noRaycast, TextPlane } from './glow.js';
import { CanvasButton, UiAction, wrapText } from './ui-button.js';

export interface PreviewEvent {
  date: string;
  title: string;
  places: string;
  currencies: string;
  summary: string;
}

export interface YearPreview {
  year: number;
  /** Era name at mid-year. */
  era: string;
  events: PreviewEvent[];
  /** Plain notes about the data (late starts, year to date). */
  notes: string[];
}

export const QUICK_YEARS: { year: number; label: string }[] = [
  { year: 1971, label: 'Dollar-gold break' },
  { year: 1985, label: 'Plaza Accord' },
  { year: 1997, label: 'Asian crisis' },
  { year: 2008, label: 'Financial crisis' },
  { year: 2022, label: 'Yen slides' },
];

export const DECADES = [1948, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

export class YearSelector {
  readonly root = new Group();
  readonly buttons: CanvasButton[] = [];
  private readonly plate: MeshBasicMaterial;
  private readonly yearText: TextPlane;
  private readonly preview: TextPlane;
  private readonly title: TextPlane;
  private readonly quick: CanvasButton[] = [];
  private readonly decades: CanvasButton[] = [];
  private readonly calmButton: CanvasButton;
  private shown = false;
  private opacity = 0;
  private year = 0;
  private previewKey = '';

  constructor() {
    this.plate = new MeshBasicMaterial({ color: 0x050a16, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const plate = noRaycast(new Mesh(new PlaneGeometry(1.74, 0.48), this.plate));
    plate.position.z = -0.004;
    this.root.add(plate);

    this.title = new TextPlane(0.8, 0.032, 64);
    this.title.mesh.position.set(-0.46, 0.215, 0.002);
    this.title.draw('t', (ctx, w, h) => {
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(h * 0.7)}px system-ui, sans-serif`;
      ctx.fillStyle = '#9fd8ff';
      ctx.fillText('CHOOSE A YEAR TO VISIT', 4, h / 2);
    });
    this.root.add(this.title.mesh);

    DECADES.forEach((d, k) => {
      const b = this.add(new CanvasButton(0.083, 0.044, UiAction.Decade + k, k === 0 ? '1948' : `${d}s`, 'ghost'), -0.825 + k * 0.0905, 0.168);
      this.decades.push(b);
    });

    this.yearText = new TextPlane(0.3, 0.12, 200);
    this.yearText.mesh.position.set(-0.46, 0.075, 0.002);
    this.root.add(this.yearText.mesh);
    this.add(new CanvasButton(0.1, 0.085, UiAction.YearMinus10, '−10'), -0.805, 0.075);
    this.add(new CanvasButton(0.1, 0.085, UiAction.YearMinus1, '−1'), -0.69, 0.075);
    this.add(new CanvasButton(0.1, 0.085, UiAction.YearPlus1, '+1'), -0.23, 0.075);
    this.add(new CanvasButton(0.1, 0.085, UiAction.YearPlus10, '+10'), -0.115, 0.075);

    QUICK_YEARS.forEach((q, k) => {
      const b = this.add(new CanvasButton(0.15, 0.07, UiAction.QuickYear + k, String(q.year), 'chip', q.label), -0.795 + k * 0.158, -0.035);
      this.quick.push(b);
    });

    this.add(new CanvasButton(0.22, 0.062, UiAction.FullJourney, 'Full Journey', 'ghost', '1948 to today'), -0.755, -0.115);
    this.calmButton = this.add(new CanvasButton(0.22, 0.062, UiAction.Calm, 'Calm motion', 'ghost', 'off'), -0.52, -0.115);

    this.preview = new TextPlane(0.84, 0.3, 560);
    this.preview.mesh.position.set(0.43, 0.075, 0.002);
    this.root.add(this.preview.mesh);
    this.add(new CanvasButton(0.32, 0.085, UiAction.StartTravel, 'Start Travel  ▶', 'primary'), 0.69, -0.11);
  }

  private add(b: CanvasButton, x: number, y: number): CanvasButton {
    b.mesh.position.set(x, y, 0.006);
    this.root.add(b.mesh);
    this.buttons.push(b);
    return b;
  }

  setShown(on: boolean): void {
    this.shown = on;
    for (const b of this.buttons) b.setShown(on);
  }

  get visibility(): number {
    return this.opacity;
  }

  setCalm(on: boolean): void {
    this.calmButton.set('Calm motion', on ? 'on' : 'off');
    this.calmButton.setSelected(on);
  }

  /** Show a year and its preview; the dial buttons are disabled at the ends. */
  setYear(p: YearPreview, min: number, max: number): void {
    this.year = p.year;
    const text = String(p.year);
    this.yearText.draw(text, (ctx, w, h) => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(h * 0.86)}px system-ui, sans-serif`;
      ctx.shadowColor = 'rgba(255,190,90,0.6)';
      ctx.shadowBlur = h * 0.08;
      ctx.fillStyle = '#ffe1a0';
      ctx.fillText(text, w / 2, h / 2 + 2);
    });
    for (const b of this.buttons) {
      if (b.action === UiAction.YearMinus1 || b.action === UiAction.YearMinus10) b.setEnabled(p.year > min);
      if (b.action === UiAction.YearPlus1 || b.action === UiAction.YearPlus10) b.setEnabled(p.year < max);
    }
    this.quick.forEach((b, k) => b.setSelected(QUICK_YEARS[k].year === p.year));
    this.decades.forEach((b, k) => {
      const d = DECADES[k];
      const next = DECADES[k + 1] ?? 9999;
      b.setSelected(p.year >= d && p.year < next);
    });
    this.drawPreview(p);
  }

  private drawPreview(p: YearPreview): void {
    const key = JSON.stringify(p);
    if (key === this.previewKey) return;
    this.previewKey = key;
    this.preview.draw(key, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(8,16,32,0.78)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(110,190,255,0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
      const pad = 30;
      let y = 62;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#ffe1a0';
      ctx.font = `700 50px system-ui, sans-serif`;
      ctx.fillText(`${p.year}: what happened`, pad, y);
      ctx.fillStyle = '#8fb3d9';
      ctx.font = `32px system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(p.era, w - pad, y);
      ctx.textAlign = 'left';
      y += 22;
      const maxW = w - pad * 2;
      const events = p.events.slice(0, 3);
      if (!events.length) {
        ctx.fillStyle = '#dbe6f5';
        ctx.font = `36px system-ui, sans-serif`;
        for (const line of wrapText(ctx, 'No verified event is recorded for this year in our history file. You can still travel there: the guide shows who led the countries and how their currencies moved.', maxW, 4)) {
          y += 46;
          ctx.fillText(line, pad, y);
        }
      }
      events.forEach((e, k) => {
        y += 56;
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 40px system-ui, sans-serif`;
        ctx.fillText(`${e.date}: ${e.title}`, pad, y, maxW);
        y += 40;
        ctx.fillStyle = '#a9c4e4';
        ctx.font = `30px system-ui, sans-serif`;
        ctx.fillText(`${e.places}  ·  Currencies to watch: ${e.currencies}`, pad, y, maxW);
        if (events.length <= 2 && k === 0 && e.summary) {
          ctx.fillStyle = '#dbe6f5';
          ctx.font = `32px system-ui, sans-serif`;
          for (const line of wrapText(ctx, e.summary, maxW, events.length === 1 ? 3 : 2)) {
            y += 40;
            ctx.fillText(line, pad, y);
          }
        }
      });
      if (p.events.length > events.length) {
        y += 46;
        ctx.fillStyle = '#8fb3d9';
        ctx.font = `30px system-ui, sans-serif`;
        ctx.fillText(`+ ${p.events.length - events.length} more on the journey`, pad, y);
      }
      if (p.notes.length) {
        ctx.fillStyle = '#9fb0cc';
        ctx.font = `28px system-ui, sans-serif`;
        const note = p.notes.join('   ·   ');
        const lines = wrapText(ctx, note, maxW, 2);
        lines.forEach((line, k) => ctx.fillText(line, pad, h - 22 - (lines.length - 1 - k) * 34));
      }
    });
  }

  get currentYear(): number {
    return this.year;
  }

  update(dt: number): void {
    this.opacity += ((this.shown ? 1 : 0) - this.opacity) * Math.min(1, dt / 0.3);
    this.root.visible = this.opacity > 0.01;
    this.plate.opacity = 0.62 * this.opacity;
    for (const t of [this.yearText, this.preview, this.title]) t.mat.opacity = this.opacity;
    for (const b of this.buttons) b.update(dt, this.opacity);
  }
}

/**
 * The guide's subtitles: always on screen in the Year Journey (voice or not),
 * in a strip along the bottom of the top band, with the speaker's name.
 */
export class CaptionStrip {
  readonly root = new Group();
  private readonly text: TextPlane;
  private current = '';
  private opacity = 0;
  private shown = false;

  constructor(width = 1.66, height = 0.085) {
    this.text = new TextPlane(width, height, 112);
    this.text.mesh.renderOrder = 14;
    this.root.add(this.text.mesh);
  }

  set(text: string | null): void {
    this.shown = !!text;
    if (!text || text === this.current) return;
    this.current = text;
    this.text.draw(text, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(3,8,18,0.86)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(94,232,255,0.9)';
      ctx.fillRect(0, 0, 8, h);
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(h * 0.26)}px system-ui, sans-serif`;
      ctx.fillStyle = '#5ee8ff';
      ctx.fillText('TOCK', 22, h * 0.3);
      const left = 22 + ctx.measureText('TOCK').width + 18;
      let size = Math.round(h * 0.34);
      ctx.font = `${size}px system-ui, sans-serif`;
      let lines = wrapText(ctx, text, w - left - 20, 99);
      if (lines.length > 2) {
        size = Math.round(h * 0.27);
        ctx.font = `${size}px system-ui, sans-serif`;
        lines = wrapText(ctx, text, w - left - 20, 3);
      }
      ctx.fillStyle = '#ffffff';
      const lh = size * 1.18;
      const top = h / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((line, k) => ctx.fillText(line, left, top + k * lh));
    });
  }

  update(dt: number): void {
    this.opacity += ((this.shown ? 1 : 0) - this.opacity) * Math.min(1, dt / 0.25);
    this.text.mat.opacity = this.opacity;
    this.root.visible = this.opacity > 0.01;
  }
}
