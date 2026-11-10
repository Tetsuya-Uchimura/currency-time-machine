/**
 * The hand panel's grip: a bar along its top edge ("⋮⋮  Grab to move") that is
 * the only part that moves the panel (pinch it, move the hand, let go), a
 * small Reset button beside it, and a faint outline of the panel shown while
 * it is grabbed (or the grip is hovered), so it is clear what will move.
 *
 * Lives in the panel's holder (panel-local meters: the panel's center at the
 * origin, its face toward +Z). Drawn on canvases (any language).
 */
import { BufferAttribute, BufferGeometry, CanvasTexture, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import { noRaycast } from './glow.js';
import { CanvasButton, roundRect, UiAction } from './ui-button.js';

export const GRIP = { width: 0.2, height: 0.032, gap: 0.012, panelWidth: 0.372 };

export class PanelGrip {
  readonly bar: Mesh;
  readonly reset: CanvasButton;
  readonly outline: LineLoop;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private readonly mat: MeshBasicMaterial;
  private readonly outlineMat: LineBasicMaterial;
  private readonly outlinePos: BufferAttribute;
  private label = '';
  private hovered = false;
  private dragging = false;
  private key = '';
  private glow = 0;
  private opacity = 0;
  private shown = true;

  constructor(label: string, resetLabel: string) {
    this.canvas.width = 640;
    this.canvas.height = Math.round((640 * GRIP.height) / GRIP.width);
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
    this.bar = new Mesh(new PlaneGeometry(GRIP.width, GRIP.height), this.mat);
    this.bar.name = 'panel-grip';
    this.bar.renderOrder = 12;
    this.reset = new CanvasButton(0.074, GRIP.height, UiAction.ResetPanel, resetLabel, 'ghost');
    this.outlinePos = new BufferAttribute(new Float32Array(12), 3);
    const g = new BufferGeometry();
    g.setAttribute('position', this.outlinePos);
    this.outlineMat = new LineBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.outline = noRaycast(new LineLoop(g, this.outlineMat));
    this.outline.frustumCulled = false;
    this.setLabel(label, resetLabel);
    this.setPanelHeight(0.26);
  }

  setLabel(label: string, resetLabel: string): void {
    this.label = label;
    this.reset.set(resetLabel);
    this.redraw();
  }

  /** Grip on the panel's top edge (panel-local meters), outline around the panel. */
  setPanelHeight(h: number): void {
    const top = h / 2 + GRIP.gap + GRIP.height / 2;
    const w = GRIP.width + 0.012 + 0.074;
    this.bar.position.set(-w / 2 + GRIP.width / 2, top, 0.004);
    this.reset.mesh.position.set(w / 2 - 0.037, top, 0.004);
    const a = this.outlinePos.array as Float32Array;
    const x = GRIP.panelWidth / 2 + 0.006;
    const y0 = -h / 2 - 0.006;
    const y1 = top + GRIP.height / 2 + 0.006;
    a.set([-x, y0, 0.002, x, y0, 0.002, x, y1, 0.002, -x, y1, 0.002]);
    this.outlinePos.needsUpdate = true;
  }

  setHover(on: boolean): void {
    if (on === this.hovered) return;
    this.hovered = on;
    this.redraw();
  }

  setDragging(on: boolean): void {
    if (on === this.dragging) return;
    this.dragging = on;
    this.redraw();
  }

  setShown(on: boolean): void {
    this.shown = on;
    this.reset.setShown(on);
  }

  update(dt: number): void {
    this.opacity += ((this.shown ? 1 : 0) - this.opacity) * Math.min(1, dt / 0.2);
    this.mat.opacity = this.opacity;
    this.bar.visible = this.opacity > 0.01;
    this.bar.raycast = this.opacity > 0.5 ? Mesh.prototype.raycast : () => {};
    const want = this.dragging ? 0.75 : this.hovered ? 0.35 : 0;
    this.glow += (want - this.glow) * Math.min(1, dt / 0.15);
    this.outlineMat.opacity = this.glow * this.opacity;
    this.outline.visible = this.outlineMat.opacity > 0.01;
    this.reset.update(dt);
  }

  private redraw(): void {
    const key = `${this.label}|${this.hovered}|${this.dragging}`;
    if (key === this.key) return;
    this.key = key;
    const ctx = this.canvas.getContext('2d')!;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    roundRect(ctx, 3, 3, w - 6, h - 6, (h - 6) / 2);
    ctx.fillStyle = this.dragging ? 'rgba(40,96,150,0.95)' : this.hovered ? 'rgba(30,64,108,0.92)' : 'rgba(10,20,38,0.78)';
    ctx.fill();
    ctx.lineWidth = this.dragging ? 5 : 3;
    ctx.strokeStyle = this.dragging || this.hovered ? '#9fe8ff' : 'rgba(120,180,240,0.45)';
    ctx.stroke();
    // Grip dots (two columns of three), then the label.
    ctx.fillStyle = this.dragging || this.hovered ? '#d9f6ff' : '#9fb8d8';
    for (let c = 0; c < 2; c++) for (let r = 0; r < 3; r++) {
      ctx.beginPath();
      ctx.arc(h * 0.62 + c * h * 0.24, h * 0.26 + r * h * 0.24, h * 0.065, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = `600 ${Math.round(h * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e6f2ff';
    ctx.fillText(this.label, w / 2 + h * 0.3, h / 2 + 1, w - h * 1.6);
    this.tex.needsUpdate = true;
  }
}
