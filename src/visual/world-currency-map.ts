/**
 * Interactive World Currency Map: the bottom band, a holographic table map.
 *
 *   land       a soft dot grid with faint coastlines (Natural Earth, public
 *              domain, Equal Earth projection; built by scripts/build_map.py)
 *   regions    each currency's home countries glow faintly in its color while
 *              its data runs; the euro area grows as members join; regions of
 *              a currency in a historical event (or soloed) glow brighter
 *   markers    a small glowing pin per currency, with a label "JPY ▲ +8.4%"
 *              and the place ("Japan", "Euro area"); the number is the same
 *              change the chart shows at its right edge (same window, same base)
 *   USD        a separate white ring: the base every rate is measured against
 *
 * Labels sit off the crowded areas (Europe's three fan out over the sea and
 * the north), joined to their markers by leader lines; the markers stay at
 * their real positions. Pinching a marker or its label solos that currency
 * (handled by the experience, shared with the chart and the sound).
 *
 * Nothing flashes: glows ease over about half a second, the slow scan light
 * only moves while time flows, and the emphasis ring breathes at 0.4 Hz.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';
import { BANDS, MAP } from '../config.js';
import { changeText } from '../data/chart-series.js';
import {
  labelRect,
  MAP_CURRENCIES,
  mapUV,
  nearestOnRect,
  placeAt,
  regionOwner,
  type MapCurrency,
  type WorldMapFile,
} from '../data/world-map.js';
import { haloTexture, noRaycast, Segments, TextPlane } from './glow.js';

export interface MapFrame {
  /** ISO date at the playhead (decides names and euro membership). */
  date: string;
  /** Per slot: change at the playhead (null: no data yet). */
  pct: (number | null)[];
  /** Per slot: line starts later than the window (label gets "*"). */
  late: boolean[];
  /** Per slot: display code (DEM before 1999). */
  codes: string[];
  /** Per slot: first year with data (shown while dormant). */
  firstYear: number[];
  focus: number[];
  solo: number;
  /** False while paused: the scan light stops with time. */
  flowing: boolean;
  /** Spotlight per slot (1 lit, 0 dimmed), or null for none (Year Journey). */
  spot?: number[] | null;
  /** Emphasis on the US dollar's marker (the base; Year Journey). */
  usd?: number;
}

const LAND = new Color(0.13, 0.18, 0.28);
const USD_COLOR = new Color(0xfff1c8);

export class WorldCurrencyMap {
  /** Add to the map band group (band-local meters). */
  readonly root = new Group();
  /** Pinch targets per slot (marker + label); index = slot. */
  readonly hits: Group[] = [];
  /** The US dollar's pinch target (Year Journey: the United States' leaders). */
  usdHit: Group | null = null;

  private readonly W = BANDS.map.width;
  private readonly H = BANDS.map.height;
  private readonly slotIds: string[];
  private readonly colors: Color[];
  private readonly css: string[];
  private readonly entries: { def: MapCurrency; slot: number }[];
  private readonly markers: { group: Group; core: MeshBasicMaterial; halo: SpriteMaterial; ring: Mesh; ringMat: MeshBasicMaterial }[] = [];
  private readonly labels: TextPlane[] = [];
  private readonly labelKeys: string[] = [];
  private readonly leaders: Segments;
  private readonly emphasis: Float32Array;
  private readonly note: TextPlane;
  private dots: Points | null = null;
  private dotColor: BufferAttribute | null = null;
  private dotData: Float32Array | null = null;
  private regions: string[] = [];
  /** Owner slot per region (-1 none, -2 USD), refreshed a few times a second. */
  private owners: Int8Array = new Int8Array(0);
  private readonly regionGlow: Float32Array = new Float32Array(64);
  private ownerTimer = 0;
  private textTimer = 0;
  private sweep = 0;
  private time = 0;

  constructor(slotIds: string[], colors: number[]) {
    this.slotIds = slotIds;
    this.colors = colors.map((c) => new Color(c));
    this.css = this.colors.map((c) => '#' + c.getHexString());
    this.emphasis = new Float32Array(slotIds.length);

    const back = noRaycast(
      new Mesh(
        new PlaneGeometry(this.W + 0.08, this.H + 0.08),
        new MeshBasicMaterial({ color: 0x040914, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
      ),
    );
    back.position.z = -0.004;
    back.renderOrder = 0;
    this.root.add(back, this.graticule());

    this.entries = MAP_CURRENCIES.map((def) => ({ def, slot: slotIds.indexOf(def.id) }));
    this.leaders = new Segments(MAP_CURRENCIES.length, 0xc8d2e6, 0.45);
    this.root.add(this.leaders.lines);
    for (const { def, slot } of this.entries) this.buildMarker(def, slot);

    this.note = new TextPlane(this.W, 0.022, 44);
    this.note.mesh.position.set(0, -this.H / 2 - 0.024, 0);
    this.note.mat.opacity = 0.75;
    this.setYearMode(false);
    this.root.add(this.note.mesh);
  }

  /** The note under the map says what the numbers measure (52 weeks, or this year). */
  setYearMode(on: boolean): void {
    const text = on
      ? "Markers show each currency's home, not where it is traded. Change vs USD since the year's first week."
      : "Markers show each currency's home, not where it is traded. Change vs USD over the chart's 52 weeks.";
    this.note.draw(text, (ctx, w, h) => {
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(h * 0.68)}px system-ui, sans-serif`;
      ctx.fillStyle = '#9fb0cc';
      ctx.fillText(text, 6, h / 2);
      ctx.textAlign = 'right';
      ctx.fillText('Map: Natural Earth', w - 6, h / 2);
    });
  }

  /** Marker position (band-local meters) of a slot, or of the US dollar ('USD'). */
  markerPosition(id: string, out: Vector3): Vector3 {
    const k = this.entries.findIndex((e) => e.def.id === id);
    return k < 0 ? out.set(0, 0, 0) : out.copy(this.markers[k].group.position);
  }

  /** Map position (band-local meters) of a longitude/latitude. */
  private xy(lon: number, lat: number): [number, number] {
    const { u, v } = mapUV(lon, lat);
    return [(u - 0.5) * this.W, (v - 0.5) * this.H];
  }

  private uvToXY(u: number, v: number): [number, number] {
    return [(u - 0.5) * this.W, (v - 0.5) * this.H];
  }

  /** Faint meridians and parallels every 30 degrees. */
  private graticule(): LineSegments {
    const pts: number[] = [];
    const seg = (a: [number, number], b: [number, number]) => pts.push(a[0], a[1], -0.002, b[0], b[1], -0.002);
    for (let lon = -180; lon <= 180; lon += 30) {
      for (let lat = -57; lat < 80; lat += 4) seg(this.xy(lon, lat), this.xy(lon, Math.min(80, lat + 4)));
    }
    for (const lat of [-30, 0, 30, 60]) {
      for (let lon = -180; lon < 180; lon += 5) seg(this.xy(lon, lat), this.xy(lon + 5, lat));
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
    const lines = noRaycast(
      new LineSegments(geo, new LineBasicMaterial({ color: 0x5a6f98, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false })),
    );
    lines.renderOrder = 1;
    return lines;
  }

  /** Land and coastlines, once the map file has loaded. */
  setLand(file: WorldMapFile): void {
    this.regions = file.regions;
    this.owners = new Int8Array(file.regions.length + 1).fill(-1);
    const coast: number[] = [];
    for (const line of file.coast) {
      for (let k = 0; k + 3 < line.length; k += 2) {
        const [x0, y0] = this.uvToXY(line[k], line[k + 1]);
        const [x1, y1] = this.uvToXY(line[k + 2], line[k + 3]);
        coast.push(x0, y0, 0, x1, y1, 0);
      }
    }
    const cg = new BufferGeometry();
    cg.setAttribute('position', new Float32BufferAttribute(coast, 3));
    const coastLines = noRaycast(
      new LineSegments(
        cg,
        new LineBasicMaterial({ color: 0x6f94cc, transparent: true, opacity: 0.32, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
      ),
    );
    coastLines.renderOrder = 2;

    const n = file.dots.length / 3;
    const pos = new Float32Array(n * 3);
    this.dotData = new Float32Array(n * 2); // u, region
    for (let k = 0; k < n; k++) {
      const [x, y] = this.uvToXY(file.dots[3 * k], file.dots[3 * k + 1]);
      pos.set([x, y, 0.001], 3 * k);
      this.dotData[2 * k] = file.dots[3 * k];
      this.dotData[2 * k + 1] = file.dots[3 * k + 2];
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    this.dotColor = new BufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage);
    geo.setAttribute('color', this.dotColor);
    this.dots = noRaycast(
      new Points(
        geo,
        new PointsMaterial({
          size: 0.0075,
          map: haloTexture(),
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          toneMapped: false,
        }),
      ),
    );
    this.dots.renderOrder = 2;
    this.root.add(coastLines, this.dots);
  }

  private buildMarker(def: MapCurrency, slot: number): void {
    const isUsd = def.id === 'USD';
    const color = isUsd ? USD_COLOR : this.colors[slot];
    const [x, y] = this.xy(def.lon, def.lat);
    const group = new Group();
    group.position.set(x, y, 0.006);
    const core = new MeshBasicMaterial({ color: color.clone(), toneMapped: false, transparent: true });
    const coreMesh = noRaycast(new Mesh(new CircleGeometry(MAP.markerRadius, 20), core));
    const halo = new SpriteMaterial({ map: haloTexture(), color: color.clone(), blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    const haloSprite = noRaycast(new Sprite(halo));
    haloSprite.scale.setScalar(0.045);
    const ringMat = new MeshBasicMaterial({ color: color.clone(), transparent: true, opacity: isUsd ? 0.8 : 0, depthWrite: false, toneMapped: false });
    const ring = noRaycast(new Mesh(new RingGeometry(MAP.markerRadius * 1.7, MAP.markerRadius * 2.2, 32), ringMat));
    for (const o of [coreMesh, haloSprite, ring]) o.renderOrder = 6;
    group.add(haloSprite, ring, coreMesh);
    this.root.add(group);
    this.markers.push({ group, core, halo, ring, ringMat });

    const w = isUsd ? MAP.usdLabelWidth : MAP.labelWidth;
    const label = new TextPlane(w, MAP.labelHeight, 100);
    const [lx, ly] = this.uvToXY(def.label.u, def.label.v);
    label.mesh.position.set(lx, ly, 0.008);
    // Labels stand up toward the viewer (undoing the table's tilt), so the far ones stay readable.
    label.mesh.rotation.x = ((BANDS.map.tiltDeg ?? 0) * Math.PI) / 180;
    label.mat.opacity = 1;
    this.root.add(label.mesh);
    this.labels.push(label);
    this.labelKeys.push('');

    // Leader line from the marker to the nearest point of its label.
    const r = labelRect(def, w / this.W, MAP.labelHeight / this.H);
    const { u: mu, v: mv } = mapUV(def.lon, def.lat);
    const end = nearestOnRect(r, mu, mv);
    const [ex, ey] = this.uvToXY(end.u, end.v);
    this.leaders.add(x, y, ex, ey, 0.004);
    this.leaders.end();

    // Pinch target: the marker (a generous circle) and its label.
    {
      const hit = new Group();
      hit.name = `map-${def.id}`;
      const invisible = () => new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
      const dot = new Mesh(new CircleGeometry(0.03, 16), invisible());
      dot.position.set(x, y, 0.012);
      const plate = new Mesh(new PlaneGeometry(w, MAP.labelHeight), invisible());
      plate.position.set(lx, ly, 0.012);
      plate.rotation.copy(label.mesh.rotation);
      hit.add(dot, plate);
      this.root.add(hit);
      if (isUsd) this.usdHit = hit;
      else this.hits[slot] = hit;
    }
  }

  update(dt: number, f: MapFrame): void {
    this.time += dt;
    if (f.flowing) this.sweep = (this.sweep + dt / 9) % 1.4;

    // Emphasis shared with the chart: event focus or solo (and the guide's spotlight).
    for (let i = 0; i < this.emphasis.length; i++) {
      const target = Math.max(f.focus[i], f.solo === i ? 1 : 0, f.spot && f.spot[i] > 0 ? 0.6 : 0);
      this.emphasis[i] += (target - this.emphasis[i]) * Math.min(1, dt / 0.5);
    }

    this.ownerTimer -= dt;
    if (this.ownerTimer <= 0) {
      this.ownerTimer = 0.25;
      this.regions.forEach((iso, k) => {
        const id = regionOwner(iso, f.date);
        this.owners[k + 1] = id === 'USD' ? -2 : this.slotIds.indexOf(id);
      });
    }
    this.updateDots(dt, f);
    this.updateMarkers(f);

    this.textTimer -= dt;
    if (this.textTimer <= 0) {
      this.textTimer = 0.2;
      this.drawLabels(f);
    }
  }

  private updateDots(dt: number, f: MapFrame): void {
    if (!this.dotColor || !this.dotData) return;
    // Region glow targets: faint for a live currency's home, bright when emphasized.
    for (let r = 1; r < this.owners.length; r++) {
      const o = this.owners[r];
      let g = 0;
      if (o === -2) g = 0.45;
      else if (o >= 0 && f.pct[o] !== null) {
        const dim = f.solo >= 0 && f.solo !== o ? 0.35 : 1;
        g = (0.62 + 0.6 * this.emphasis[o]) * dim;
      }
      this.regionGlow[r] += (g - this.regionGlow[r]) * Math.min(1, dt / 0.5);
    }
    const col = this.dotColor.array as Float32Array;
    const data = this.dotData;
    const n = data.length / 2;
    const s = this.sweep - 0.2;
    for (let k = 0; k < n; k++) {
      const u = data[2 * k];
      const r = data[2 * k + 1];
      const d = (u - s) / 0.06;
      const scan = 1 + 0.18 * Math.exp(-d * d);
      let cr = LAND.r;
      let cg = LAND.g;
      let cb = LAND.b;
      const g = r > 0 ? this.regionGlow[r] : 0;
      if (g > 0.001) {
        const o = this.owners[r];
        const c = o === -2 ? USD_COLOR : this.colors[o] ?? LAND;
        const m = Math.min(1, g);
        const boost = 0.75 + 0.8 * g;
        cr += (c.r * boost - cr) * m;
        cg += (c.g * boost - cg) * m;
        cb += (c.b * boost - cb) * m;
      }
      col[3 * k] = cr * scan;
      col[3 * k + 1] = cg * scan;
      col[3 * k + 2] = cb * scan;
    }
    this.dotColor.needsUpdate = true;
  }

  private updateMarkers(f: MapFrame): void {
    const breathe = 0.5 + 0.5 * Math.sin(this.time * Math.PI * 0.8);
    this.entries.forEach(({ def, slot }, k) => {
      const m = this.markers[k];
      if (def.id === 'USD') {
        const u = f.usd ?? 0;
        m.ringMat.opacity = 0.8 + 0.2 * u;
        m.halo.opacity = 0.35 + 0.5 * u;
        m.group.scale.setScalar(1 + 0.4 * u * (0.85 + 0.15 * breathe));
        return;
      }
      const alive = f.pct[slot] !== null;
      const e = this.emphasis[slot];
      const dim = (f.solo >= 0 && f.solo !== slot ? 0.45 : 1) * (f.spot && f.solo < 0 && !(f.spot[slot] > 0) ? 0.5 : 1);
      m.core.opacity = (alive ? 1 : 0.35) * dim;
      m.halo.opacity = (alive ? 0.35 + 0.5 * e : 0.08) * dim;
      m.ringMat.opacity = alive ? e * (0.55 + 0.35 * breathe) : 0;
      m.ring.scale.setScalar(1 + 0.25 * e * breathe);
      m.group.scale.setScalar(1 + 0.4 * e);
      this.labels[k].mat.opacity = (alive ? 1 : 0.55) * (f.solo >= 0 && f.solo !== slot ? 0.5 : 1);
    });
  }

  private drawLabels(f: MapFrame): void {
    this.entries.forEach(({ def, slot }, k) => {
      const place = placeAt(def, f.date);
      let top: string;
      let value = '';
      let bottom = place;
      let color = '#fff1c8';
      if (def.id === 'USD') {
        top = 'USD';
        value = 'base';
        bottom = 'United States · the base';
      } else {
        const pct = f.pct[slot];
        top = f.codes[slot] + (f.late[slot] ? '*' : '');
        color = this.css[slot];
        if (pct === null) value = `data from ${f.firstYear[slot]}`;
        else value = changeText(pct);
      }
      const key = `${top}|${value}|${bottom}`;
      if (key === this.labelKeys[k]) return;
      this.labelKeys[k] = key;
      this.labels[k].draw(key, (ctx, w, h) => {
        ctx.fillStyle = 'rgba(4,7,14,0.72)';
        roundRect(ctx, 0, 0, w, h, h * 0.16);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillRect(0, h * 0.12, 6, h * 0.76);
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(h * 0.4)}px system-ui, sans-serif`;
        ctx.fillStyle = color;
        ctx.fillText(top, 18, h * 0.33);
        const tw = ctx.measureText(top + ' ').width;
        ctx.font = `${Math.round(h * 0.36)}px system-ui, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(value, 18 + tw + 6, h * 0.33);
        ctx.font = `${Math.round(h * 0.27)}px system-ui, sans-serif`;
        ctx.fillStyle = '#c4cee2';
        ctx.fillText(bottom, 18, h * 0.76);
      });
    });
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Fetch the bundled world map; null if missing (the band then shows markers on a blank table). */
export async function loadWorldMap(baseUrl: string): Promise<WorldMapFile | null> {
  try {
    const res = await fetch(`${baseUrl}data/world-map.json`);
    return res.ok ? ((await res.json()) as WorldMapFile) : null;
  } catch {
    return null;
  }
}
