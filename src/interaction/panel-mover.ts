/**
 * Moving the hand panel by its grip.
 *
 * Headset (hands or controllers):
 *   - pinch the grip from afar (its ray), or bring the hand to the grip and
 *     pinch there; keep pinching and move the hand: the panel follows the hand
 *     one to one; let go: it stays. Either hand.
 *   - only the grip starts a move: pressing the panel's buttons never does.
 * PC browser (no headset): drag the grip with the mouse; the mouse wheel
 * while dragging brings it nearer or farther.
 *
 * Wherever it is taken, the panel stays inside the safe zone (panel-placement)
 * and keeps facing the head. Its pose is relative to the user's starting head
 * (the rig), saved in this browser and restored next time; Reset glides it
 * back to the lap tray.
 */
import { Box3, Group, Plane, Raycaster, Vector2, Vector3, type InputManager, type Object3D, type PerspectiveCamera, type XROrigin } from '@iwsdk/core';
import { clampPose, DEFAULT_PANEL, facingOf, isDefault, PANEL_STORAGE_KEY, parseSaved, poseOf, positionOf, serialize, type PanelPose } from './panel-placement.js';
import { GRIP, PanelGrip } from '../visual/panel-grip.js';

type Hand = 'left' | 'right';
const HANDS: Hand[] = ['right', 'left'];

export interface PanelMoverDeps {
  input: InputManager;
  player: XROrigin;
  camera: PerspectiveCamera;
  dom: HTMLElement;
  /** The rig (the user's starting head): poses are relative to it. */
  rig: Object3D;
  inXR: () => boolean;
}

interface Drag {
  hand: Hand | 'mouse';
  startHand: Vector3;
  startPanel: Vector3;
  plane: Plane;
}

export class PanelMover {
  /** Holds the panel and its grip; placed at the pose. */
  readonly holder = new Group();
  readonly grip: PanelGrip;
  private pose: PanelPose;
  private readonly shown: PanelPose;
  private drag: Drag | null = null;
  private glide = false;
  private panel: Object3D | null = null;
  private panelHeight = 0.26;
  private measureIn = 0;
  private readonly deps: PanelMoverDeps;
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly box = new Box3();
  private readonly ray = new Raycaster();
  private readonly mouse = new Vector2();
  private readonly cleanup: (() => void)[] = [];
  /** Called when a move ends (saved) or the panel is reset. */
  onMoved: (() => void) | null = null;

  constructor(deps: PanelMoverDeps, label: string, resetLabel: string) {
    this.deps = deps;
    this.pose = load() ?? { ...DEFAULT_PANEL };
    this.shown = { ...this.pose };
    this.grip = new PanelGrip(label, resetLabel);
    this.holder.rotation.order = 'YXZ';
    this.holder.add(this.grip.outline);
    this.place();

    // PC: the mouse drags the grip, the wheel sets the distance while dragging.
    const move = (e: PointerEvent) => {
      const r = deps.dom.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const up = () => {
      if (this.drag?.hand === 'mouse') this.end();
    };
    const wheel = (e: WheelEvent) => {
      if (this.drag?.hand !== 'mouse') return;
      e.preventDefault();
      this.pose = clampPose({ ...this.pose, dist: this.pose.dist - Math.sign(e.deltaY) * 0.02 });
      this.drag.startPanel.fromArray(positionOf(this.pose));
      this.drag.startHand.copy(this.mouseHit(this.drag.plane) ?? this.drag.startHand);
    };
    deps.dom.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    deps.dom.addEventListener('wheel', wheel, { passive: false });
    this.cleanup.push(
      () => deps.dom.removeEventListener('pointermove', move),
      () => window.removeEventListener('pointerup', up),
      () => deps.dom.removeEventListener('wheel', wheel),
    );
  }

  /** The panel (UIKit) inside the holder: its height places the grip. */
  setPanel(panel: Object3D): void {
    this.panel = panel;
    this.measureIn = 0;
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  get current(): PanelPose {
    return this.pose;
  }

  /** Where the panel is (rig-local), e.g. to keep Tock out of its way. */
  get yaw(): number {
    return this.pose.yaw;
  }

  /** The grip was pressed (its ray, its poke, or the mouse). */
  gripPressed(): void {
    if (this.drag) return;
    if (!this.deps.inXR()) {
      this.startMouse();
      return;
    }
    // Which hand pinches? (A poke without a pinch does not move the panel.)
    let best: Hand | null = null;
    let bestDot = -2;
    const gripWorld = this.grip.bar.getWorldPosition(this.v2);
    for (const h of HANDS) {
      const s = this.deps.input.xr.getSelectState(h);
      if (!s.active && !s.start) continue;
      // The one whose ray points most nearly at the grip.
      const space = this.deps.player.raySpaces[h];
      const origin = space.getWorldPosition(this.v1);
      const dir = gripWorld.clone().sub(origin).normalize();
      const fwd = new Vector3(0, 0, -1).transformDirection(space.matrixWorld);
      const dot = dir.dot(fwd);
      if (dot > bestDot) {
        bestDot = dot;
        best = h;
      }
    }
    if (best) this.startHand(best);
  }

  /** Back to the lap tray (gliding). */
  reset(): void {
    this.end(false);
    this.pose = { ...DEFAULT_PANEL };
    this.glide = true;
    try {
      localStorage.removeItem(PANEL_STORAGE_KEY);
    } catch {
      /* private mode */
    }
    this.onMoved?.();
  }

  update(dt: number): void {
    const xr = this.deps.inXR();
    if (this.drag && this.drag.hand !== 'mouse' && !xr) this.end();
    // Near pinch: a hand pinching right at the grip (its ray may point past it).
    if (!this.drag && xr) {
      for (const h of HANDS) {
        if (!this.deps.input.xr.getSelectState(h).start) continue;
        const tip = this.deps.player.indexTipSpaces[h].getWorldPosition(this.v1);
        this.grip.bar.worldToLocal(tip);
        // (Tight in height: the panel's frame starts under 3 cm below the grip's center and its buttons
        // about 4 cm below; a pinch there is not a grab.)
        if (Math.abs(tip.x) < GRIP.width / 2 + 0.025 && Math.abs(tip.y) < GRIP.height / 2 + 0.012 && Math.abs(tip.z) < 0.07) {
          this.startHand(h);
          break;
        }
      }
    }
    // Follow the hand (or the mouse).
    const d = this.drag;
    if (d) {
      let at: Vector3 | null;
      if (d.hand === 'mouse') at = this.mouseHit(d.plane);
      else if (!this.deps.input.xr.getSelectState(d.hand).active) {
        this.end();
        at = null;
      } else at = this.handPos(d.hand);
      if (at && this.drag) {
        const p = this.v2.copy(d.startPanel).add(at).sub(d.startHand);
        this.pose = clampPose(poseOf(p.x, p.y, p.z));
      }
    }
    // Ease the shown pose: quick while held, a soft glide for a reset.
    const tc = this.drag ? 0.05 : this.glide ? 0.35 : 0.08;
    const k = Math.min(1, dt / tc);
    this.shown.yaw += (this.pose.yaw - this.shown.yaw) * k;
    this.shown.elev += (this.pose.elev - this.shown.elev) * k;
    this.shown.dist += (this.pose.dist - this.shown.dist) * k;
    if (this.glide && Math.abs(this.shown.yaw - this.pose.yaw) + Math.abs(this.shown.elev - this.pose.elev) < 0.05) this.glide = false;
    this.place();

    // The panel's height (its rows change with the journey): measured twice a second.
    this.measureIn -= dt;
    if (this.panel && this.measureIn <= 0) {
      this.measureIn = 0.5;
      const h = this.measure();
      if (h > 0.05 && Math.abs(h - this.panelHeight) > 0.002) {
        this.panelHeight = h;
        this.grip.setPanelHeight(h);
      }
    }
    this.grip.setDragging(this.drag !== null);
    this.grip.update(dt);
  }

  dispose(): void {
    this.cleanup.forEach((f) => f());
  }

  private place(): void {
    const [x, y, z] = positionOf(this.shown);
    this.holder.position.set(x, y, z);
    const f = facingOf(this.shown);
    this.holder.rotation.set(f.x, f.y, 0, 'YXZ');
  }

  private startHand(h: Hand): void {
    this.drag = { hand: h, startHand: this.handPos(h).clone(), startPanel: new Vector3(...positionOf(this.pose)), plane: new Plane() };
    this.glide = false;
  }

  private startMouse(): void {
    // A plane through the grip, facing the camera: the grabbed point slides on it.
    const at = this.grip.bar.getWorldPosition(new Vector3());
    const n = this.deps.camera.getWorldDirection(new Vector3()).negate();
    const plane = new Plane().setFromNormalAndCoplanarPoint(n, at);
    const hit = this.mouseHit(plane);
    if (!hit) return;
    this.drag = { hand: 'mouse', startHand: hit.clone(), startPanel: new Vector3(...positionOf(this.pose)), plane };
    this.glide = false;
  }

  private end(save = true): void {
    if (!this.drag) return;
    this.drag = null;
    if (!save) return;
    try {
      if (isDefault(this.pose)) localStorage.removeItem(PANEL_STORAGE_KEY);
      else localStorage.setItem(PANEL_STORAGE_KEY, serialize(this.pose));
    } catch {
      /* private mode: kept for this session only */
    }
    this.onMoved?.();
  }

  /** A hand's position in the rig. */
  private handPos(h: Hand): Vector3 {
    this.deps.player.gripSpaces[h].getWorldPosition(this.v1);
    return this.deps.rig.worldToLocal(this.v1);
  }

  /** Where the mouse ray meets the drag plane, in the rig (or null). */
  private mouseHit(plane: Plane): Vector3 | null {
    this.ray.setFromCamera(this.mouse, this.deps.camera);
    const hit = this.ray.ray.intersectPlane(plane, new Vector3());
    return hit ? this.deps.rig.worldToLocal(hit) : null;
  }

  /** The panel's height in meters (its UIKit root's size; else its bounds). */
  private measure(): number {
    const p = this.panel as (Object3D & { getElementById?: (id: string) => { size?: { value?: [number, number] } } | null }) | null;
    const size = p?.getElementById?.('panel-root')?.size?.value;
    if (size) return size[1] * 0.01 * (p?.scale.y ?? 0.1);
    if (!p) return 0;
    this.box.setFromObject(p);
    return this.box.max.y - this.box.min.y;
  }
}

function load(): PanelPose | null {
  try {
    return parseSaved(localStorage.getItem(PANEL_STORAGE_KEY));
  } catch {
    return null;
  }
}
