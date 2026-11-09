/**
 * The Historical Events band between events: never empty, never ahead of time.
 *
 *   clock      the year and month at the playhead, and the era's name
 *   story      the latest caption (event, onboarding hint), or a short
 *              description of the era when there is none
 *   journey    a line from 1948 to today with the playhead on it; major
 *              moments are ticks. A moment shows only its year until the
 *              playhead has reached it (no outcome is given away early).
 *
 * When a Historical Portal opens, this view fades out and the portal takes
 * the band; it returns when the portal closes. Canvas text is redrawn only
 * when it changes.
 */
import { Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial, AdditiveBlending } from '@iwsdk/core';
import { BANDS } from '../config.js';
import { haloTexture, noRaycast, TextPlane } from './glow.js';

export interface Milestone {
  /** Week index of the actual date. */
  t: number;
  year: string;
  /** Shown once reached ("Dollar-gold break"). */
  name: string;
  /** Has a Historical Portal (drawn a little larger). */
  portal: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export class EraPanel {
  readonly root = new Group();
  private readonly back: MeshBasicMaterial;
  private readonly clock: TextPlane;
  private readonly story: TextPlane;
  private readonly journey: TextPlane;
  private readonly fill: Mesh;
  private readonly fillMat: MeshBasicMaterial;
  private readonly dot: Sprite;
  private readonly dotMat: SpriteMaterial;
  private readonly milestones: Milestone[];
  private readonly last: number;
  private readonly lineX0: number;
  private readonly lineX1: number;
  private caption: { label: string; text: string; hint: boolean } | null = null;
  private passed = -1;

  constructor(milestones: Milestone[], lastIndex: number) {
    this.milestones = milestones;
    this.last = lastIndex;
    const W = BANDS.events.width;
    const H = BANDS.events.height;
    this.back = new MeshBasicMaterial({ color: 0x050a16, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
    const back = noRaycast(new Mesh(new PlaneGeometry(W, H), this.back));
    back.position.z = -0.004;
    back.renderOrder = 0;

    this.clock = new TextPlane(0.5, 0.29, 580);
    this.clock.mesh.position.set(-W / 2 + 0.04 + 0.25, 0.05, 0);
    this.story = new TextPlane(1.1, 0.27, 540);
    this.story.mesh.position.set(W / 2 - 0.04 - 0.55, 0.05, 0);

    // Journey line along the bottom: a canvas for ticks and years, a glowing fill up to the playhead.
    this.lineX0 = -W / 2 + 0.1;
    this.lineX1 = W / 2 - 0.1;
    this.journey = new TextPlane(W - 0.04, 0.09, 180);
    this.journey.mesh.position.set(0, -H / 2 + 0.065, 0);
    this.fillMat = new MeshBasicMaterial({ color: 0x9fc2ff, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, blending: AdditiveBlending });
    this.fill = noRaycast(new Mesh(new PlaneGeometry(1, 0.004), this.fillMat));
    this.fill.position.set(0, -H / 2 + 0.075, 0.002);
    this.dotMat = new SpriteMaterial({ map: haloTexture(), color: new Color(0xffffff), blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    this.dot = noRaycast(new Sprite(this.dotMat));
    this.dot.scale.setScalar(0.035);
    this.dot.position.set(this.lineX0, -H / 2 + 0.075, 0.004);
    this.root.add(back, this.clock.mesh, this.story.mesh, this.journey.mesh, this.fill, this.dot);
  }

  /** The caption to show (events, the hint), or null for the era description. */
  setCaption(c: { label: string; text: string; hint?: boolean } | null): void {
    this.caption = c ? { label: c.label, text: c.text, hint: !!c.hint } : null;
  }

  /**
   * @param p playhead (week index)
   * @param date the playhead's date
   * @param era the era at the playhead
   * @param visible 0..1 (falls while a portal holds the band)
   * @param today the ending: the clock reads "Today"
   */
  update(p: number, date: Date, era: { name: string; text: string }, visible: number, today: boolean): void {
    this.root.visible = visible > 0.003;
    if (!this.root.visible) return;
    this.back.opacity = 0.5 * visible;
    for (const t of [this.clock, this.story, this.journey]) t.mat.opacity = visible;

    const year = today ? 'Today' : String(date.getUTCFullYear());
    const month = today ? '' : MONTHS[date.getUTCMonth()];
    this.clock.draw(`${year}|${month}|${era.name}`, (ctx, w, h) => {
      ctx.textBaseline = 'alphabetic';
      ctx.font = `bold ${Math.round(h * 0.46)}px system-ui, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(year, 8, h * 0.5);
      ctx.font = `${Math.round(h * 0.13)}px system-ui, sans-serif`;
      ctx.fillStyle = '#c9d5ec';
      ctx.fillText(month, 12, h * 0.68);
      ctx.font = `bold ${Math.round(h * 0.1)}px system-ui, sans-serif`;
      ctx.fillStyle = '#ffd84a';
      for (const [k, line] of wrap(ctx, era.name, w - 24).slice(0, 2).entries()) ctx.fillText(line, 12, h * (0.85 + k * 0.12));
    });

    const c = this.caption;
    const key = c ? `c|${c.label}|${c.text}|${c.hint}` : `e|${era.text}`;
    this.story.draw(key, (ctx, w, h) => {
      ctx.textBaseline = 'alphabetic';
      let y = h * 0.2;
      if (c && c.label) {
        ctx.font = `bold ${Math.round(h * 0.13)}px system-ui, sans-serif`;
        ctx.fillStyle = '#ffd84a';
        ctx.fillText(c.label, 8, y);
        y += h * 0.19;
      } else if (c?.hint) {
        ctx.font = `bold ${Math.round(h * 0.11)}px system-ui, sans-serif`;
        ctx.fillStyle = '#9fc2ff';
        ctx.fillText('How to explore', 8, y);
        y += h * 0.18;
      } else {
        ctx.font = `bold ${Math.round(h * 0.11)}px system-ui, sans-serif`;
        ctx.fillStyle = '#9fadc6';
        ctx.fillText('The era', 8, y);
        y += h * 0.18;
      }
      ctx.font = `${Math.round(h * 0.125)}px system-ui, sans-serif`;
      ctx.fillStyle = '#f4f6fa';
      for (const line of wrap(ctx, c ? c.text : era.text, w - 16).slice(0, 4)) {
        ctx.fillText(line, 8, y);
        y += h * 0.165;
      }
    });

    // Journey: redraw only when another milestone has been reached.
    let passed = 0;
    for (const m of this.milestones) if (p >= m.t) passed++;
    if (passed !== this.passed) {
      this.passed = passed;
      this.drawJourney();
    }
    const f = Math.min(1, Math.max(0, p / this.last));
    const x = this.lineX0 + (this.lineX1 - this.lineX0) * f;
    this.fill.scale.x = Math.max(1e-4, x - this.lineX0);
    this.fill.position.x = (this.lineX0 + x) / 2;
    this.fillMat.opacity = 0.75 * visible;
    this.dot.position.x = x;
    this.dotMat.opacity = visible;
  }

  private drawJourney(): void {
    const ms = this.milestones;
    const passed = this.passed;
    const W = BANDS.events.width - 0.04;
    this.journey.draw(`j${passed}`, (ctx, w, h) => {
      const px = (x: number) => ((x + W / 2) / W) * w;
      const x0 = px(this.lineX0);
      const x1 = px(this.lineX1);
      const y = h * 0.28;
      ctx.strokeStyle = 'rgba(160,180,215,0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `${Math.round(h * 0.22)}px system-ui, sans-serif`;
      ctx.fillStyle = '#9fadc6';
      ctx.fillText('1948', x0, h * 0.62);
      ctx.fillText('Today', x1, h * 0.62);
      let lastLabel = -Infinity;
      ms.forEach((m, k) => {
        const x = x0 + (x1 - x0) * Math.min(1, m.t / this.last);
        const labelled = x - lastLabel > h * 0.62; // years too close together: the dot only
        if (labelled) lastLabel = x;
        const reached = k < passed;
        ctx.fillStyle = reached ? '#ffdc8c' : 'rgba(200,210,230,0.55)';
        ctx.beginPath();
        ctx.arc(x, y, m.portal ? 9 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `${reached ? 'bold ' : ''}${Math.round(h * 0.2)}px system-ui, sans-serif`;
        if (labelled) ctx.fillText(m.year, x, h * 0.6);
        if (reached && m.portal) {
          ctx.font = `${Math.round(h * 0.18)}px system-ui, sans-serif`;
          ctx.fillStyle = '#e6d3a8';
          ctx.fillText(m.name, x, h * 0.88);
        }
      });
    });
  }

  dispose(): void {
    [this.clock, this.story, this.journey].forEach((t) => t.dispose());
    this.fill.geometry.dispose();
    this.fillMat.dispose();
    this.dotMat.dispose();
    this.back.dispose();
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
