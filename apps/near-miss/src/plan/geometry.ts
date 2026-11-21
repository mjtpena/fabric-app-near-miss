/**
 * Plan geometry: turns zone rectangles (100 × 60 grid) into an architectural drawing: exterior and interior walls,
 * openings onto vehicle routes, doors with swings, numbered dock doors with trailers, racking, machine bases, desks,
 * route centre lines and zebra crossings. Pure and deterministic, so every site draws the same way every time.
 * Everything here is derived from the zones' kinds and positions; nothing is invented per site.
 */
import { GRID, type SiteKind, type Zone, type ZoneKind } from '../model';

export const INDOOR: ZoneKind[] = ['room', 'dock', 'store', 'route', 'plant', 'office', 'welfare'];
export const isIndoor = (k: ZoneKind) => INDOOR.includes(k);
/** Zones that open onto a vehicle route without a wall (forklifts drive in). */
const OPEN_TO_ROUTE: ZoneKind[] = ['store', 'dock', 'plant', 'route'];

export type WallKind = 'exterior' | 'interior' | 'open' | 'fence';

export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface Wall extends Seg {
  kind: WallKind;
}
export interface Door {
  /** Hinge point, opening direction and width, in grid units. */
  x: number;
  y: number;
  /** Unit vector along the wall. */
  dx: number;
  dy: number;
  /** Unit normal pointing into the room the door swings into. */
  nx: number;
  ny: number;
  width: number;
}
export interface DockDoor {
  n: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Unit normal pointing outside (where trailers park). */
  nx: number;
  ny: number;
  width: number;
  zoneId: string;
}

export function zoneAtPoint(zones: Zone[], x: number, y: number): Zone | null {
  const hits = zones.filter((z) => x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h);
  return hits.sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null;
}

interface Edge {
  zone: Zone;
  /** Start point and direction of the edge, and the outward normal. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  nx: number;
  ny: number;
  len: number;
}

function edgesOf(z: Zone): Edge[] {
  return [
    { zone: z, x: z.x, y: z.y, dx: 1, dy: 0, nx: 0, ny: -1, len: z.w }, // top
    { zone: z, x: z.x, y: z.y + z.h, dx: 1, dy: 0, nx: 0, ny: 1, len: z.w }, // bottom
    { zone: z, x: z.x, y: z.y, dx: 0, dy: 1, nx: -1, ny: 0, len: z.h }, // left
    { zone: z, x: z.x + z.w, y: z.y, dx: 0, dy: 1, nx: 1, ny: 0, len: z.h }, // right
  ];
}

interface Run {
  edge: Edge;
  from: number;
  to: number;
  kind: WallKind | null;
  neighbour: Zone | null;
}

/** Walk an edge in half-unit steps and group it by what lies on the other side. */
function runsOf(e: Edge, zones: Zone[], siteKind: SiteKind): Run[] {
  const runs: Run[] = [];
  const step = 0.5;
  for (let t = 0; t < e.len - 1e-9; t += step) {
    const mx = e.x + e.dx * (t + step / 2) + e.nx * 0.25;
    const my = e.y + e.dy * (t + step / 2) + e.ny * 0.25;
    const other = zoneAtPoint(zones, mx, my);
    const kind = classify(e.zone, other, siteKind);
    const last = runs[runs.length - 1];
    if (last && last.kind === kind && last.neighbour?.id === other?.id) last.to = t + step;
    else runs.push({ edge: e, from: t, to: t + step, kind, neighbour: other });
  }
  return runs;
}

function classify(self: Zone, other: Zone | null, siteKind: SiteKind): WallKind | null {
  const a = isIndoor(self.kind);
  if (!other) return a ? 'exterior' : 'fence';
  const b = isIndoor(other.kind);
  if (a && !b) return 'exterior';
  if (!a) return null; // a yard next to anything: the other side draws it (or nothing, yard to yard)
  // Offices have corridors, not vehicle routes: every room keeps its wall and door.
  if (siteKind !== 'office' && ((self.kind === 'route' && OPEN_TO_ROUTE.includes(other.kind)) || (other.kind === 'route' && OPEN_TO_ROUTE.includes(self.kind)))) return 'open';
  return 'interior';
}

const segOf = (r: Run, from = r.from, to = r.to): Seg => ({
  x1: r.edge.x + r.edge.dx * from,
  y1: r.edge.y + r.edge.dy * from,
  x2: r.edge.x + r.edge.dx * to,
  y2: r.edge.y + r.edge.dy * to,
});

export interface PlanDrawing {
  walls: Wall[];
  doors: Door[];
  dockDoors: DockDoor[];
  /** Trailers parked at alternate dock doors (outside the building). */
  trailers: { x: number; y: number; w: number; h: number }[];
  /** Zebra crossings on routes where people cross to a dock. */
  crossings: { x: number; y: number; w: number; h: number; vertical: boolean }[];
}

const DOOR_W = 2.2;
const DOCK_PITCH = 2.4;
const DOCK_W = 1.7;

/**
 * Walls, doors and dock doors for a site. Interior walls are emitted once per pair of zones (the zone with the
 * smaller id draws it). Each interior wall run of 6+ units gets one door in its middle; each exterior run of a
 * room facing a yard gets one; docks get numbered dock doors along their longest exterior run.
 */
export function drawPlan(zones: Zone[], siteKind: SiteKind): PlanDrawing {
  const walls: Wall[] = [];
  const doors: Door[] = [];
  const dockDoors: DockDoor[] = [];
  const trailers: PlanDrawing['trailers'] = [];
  const crossings: PlanDrawing['crossings'] = [];
  let dockNo = 0;
  const ordered = [...zones].sort((a, b) => a.y - b.y || a.x - b.x);

  for (const z of ordered) {
    const runs = edgesOf(z).flatMap((e) => runsOf(e, zones, siteKind));
    // Dock doors go on the longest exterior run of a dock.
    const dockRun =
      z.kind === 'dock' ? runs.filter((r) => r.kind === 'exterior').sort((a, b) => b.to - b.from - (a.to - a.from))[0] ?? null : null;

    for (const r of runs) {
      if (!r.kind) continue;
      if ((r.kind === 'interior' || r.kind === 'open') && r.neighbour && r.neighbour.id < z.id) continue;
      const len = r.to - r.from;
      if (r === dockRun) {
        const n = Math.max(1, Math.floor((len - 0.6) / DOCK_PITCH));
        const pad = (len - n * DOCK_PITCH) / 2;
        let cursor = r.from;
        for (let k = 0; k < n; k++) {
          const start = r.from + pad + k * DOCK_PITCH + (DOCK_PITCH - DOCK_W) / 2;
          walls.push({ kind: 'exterior', ...segOf(r, cursor, start) });
          cursor = start + DOCK_W;
          dockNo += 1;
          const p = segOf(r, start, start + DOCK_W);
          dockDoors.push({ n: dockNo, x: p.x1, y: p.y1, dx: r.edge.dx, dy: r.edge.dy, nx: r.edge.nx, ny: r.edge.ny, width: DOCK_W, zoneId: z.id });
          if (k % 2 === 0) {
            // A trailer backed up to the door: 1.6 wide, 7 long, outside.
            const cx = p.x1 + r.edge.dx * (DOCK_W / 2);
            const cy = p.y1 + r.edge.dy * (DOCK_W / 2);
            const along = 1.6;
            const out = 7;
            const gap = 0.4;
            trailers.push(
              r.edge.dx !== 0
                ? { x: cx - along / 2, y: r.edge.ny > 0 ? cy + gap : cy - gap - out, w: along, h: out }
                : { x: r.edge.nx > 0 ? cx + gap : cx - gap - out, y: cy - along / 2, w: out, h: along },
            );
          }
        }
        walls.push({ kind: 'exterior', ...segOf(r, cursor, r.to) });
        continue;
      }
      const wantsDoor =
        (r.kind === 'interior' && len >= 6) ||
        (r.kind === 'exterior' && len >= 8 && r.neighbour !== null && !isIndoor(r.neighbour.kind) && z.kind !== 'route');
      if (wantsDoor) {
        const mid = r.from + len / 2;
        const a = mid - DOOR_W / 2;
        walls.push({ kind: r.kind, ...segOf(r, r.from, a) });
        walls.push({ kind: r.kind, ...segOf(r, a + DOOR_W, r.to) });
        const p = segOf(r, a, a + DOOR_W);
        // Swing into this zone (opposite the outward normal).
        doors.push({ x: p.x1, y: p.y1, dx: r.edge.dx, dy: r.edge.dy, nx: -r.edge.nx, ny: -r.edge.ny, width: DOOR_W });
      } else {
        walls.push({ kind: r.kind, ...segOf(r) });
      }
    }
  }

  // Zebra crossings: where a route meets a dock, people cross from the dock edge.
  if (siteKind !== 'office') {
    for (const route of zones.filter((z) => z.kind === 'route')) {
      for (const dock of zones.filter((z) => z.kind === 'dock')) {
        const horizontal = route.w >= route.h;
        if (horizontal) {
          const touches = Math.abs(dock.y + dock.h - route.y) < 0.01 || Math.abs(dock.y - (route.y + route.h)) < 0.01;
          const overlap = Math.min(dock.x + dock.w, route.x + route.w) - Math.max(dock.x, route.x);
          if (touches && overlap > 4) crossings.push({ x: Math.max(dock.x, route.x) + 1.5, y: route.y, w: 3.2, h: route.h, vertical: true });
        } else {
          const touches = Math.abs(dock.x + dock.w - route.x) < 0.01 || Math.abs(dock.x - (route.x + route.w)) < 0.01;
          const overlap = Math.min(dock.y + dock.h, route.y + route.h) - Math.max(dock.y, route.y);
          if (touches && overlap > 4) crossings.push({ x: route.x, y: Math.max(dock.y, route.y) + 1.5, w: route.w, h: 3.2, vertical: false });
        }
      }
    }
  }
  return { walls, doors, dockDoors, trailers, crossings };
}

/* ------------------------------------------------------------------ fixtures inside zones */

export interface Fixture {
  kind: 'rack' | 'machine' | 'desk' | 'table' | 'bay' | 'lane-dash' | 'chevron';
  x: number;
  y: number;
  w: number;
  h: number;
  /** For chevrons: direction (1 = +x / +y). */
  dir?: number;
  vertical?: boolean;
}

/** Furniture and fixtures that show what a zone is: racks in stores, machines in plant, desks in offices… */
export function fixturesOf(z: Zone, siteKind: SiteKind): Fixture[] {
  const out: Fixture[] = [];
  const pad = 2;
  const ix = z.x + pad;
  const iy = z.y + pad + 2.6; // leave room for the label
  const iw = z.w - pad * 2;
  const ih = z.h - pad * 2 - 2.6;
  // Routes are narrow: their markings ignore the label inset.
  if (z.kind === 'route') {
    if (siteKind === 'office') return out;
    const horizontal = z.w >= z.h;
    const len = horizontal ? z.w : z.h;
    const mid = horizontal ? z.y + z.h / 2 : z.x + z.w / 2;
    for (let t = 1; t < len - 1; t += 4) {
      out.push(horizontal ? { kind: 'lane-dash', x: z.x + t, y: mid - 0.1, w: 2, h: 0.2 } : { kind: 'lane-dash', x: mid - 0.1, y: z.y + t, w: 0.2, h: 2 });
    }
    for (let t = 9; t < len - 4; t += 22) {
      const q = horizontal ? z.h / 4 : z.w / 4;
      out.push(horizontal ? { kind: 'chevron', x: z.x + t, y: z.y + q, w: 1.4, h: 1.4, dir: 1 } : { kind: 'chevron', x: z.x + q, y: z.y + t, w: 1.4, h: 1.4, dir: 1, vertical: true });
      out.push(horizontal ? { kind: 'chevron', x: z.x + t + 8, y: z.y + z.h - q, w: 1.4, h: 1.4, dir: -1 } : { kind: 'chevron', x: z.x + z.w - q, y: z.y + t + 8, w: 1.4, h: 1.4, dir: -1, vertical: true });
    }
    return out;
  }
  if (iw <= 2 || ih <= 2) return out;

  if (z.kind === 'store') {
    // Rack runs along the longer side, back-to-back pairs with aisles between.
    const vertical = z.h > z.w;
    const depth = 1.1;
    const aisle = 2.8;
    const across = vertical ? iw : ih;
    const pitch = depth * 2 + aisle;
    const pairs = Math.max(1, Math.floor((across + aisle) / pitch));
    const used = pairs * pitch - aisle;
    const off = (across - used) / 2;
    for (let p = 0; p < pairs; p++) {
      for (let k = 0; k < 2; k++) {
        const o = off + p * pitch + k * depth;
        out.push(vertical ? { kind: 'rack', x: ix + o, y: iy, w: depth, h: ih, vertical } : { kind: 'rack', x: ix, y: iy + o, w: iw, h: depth, vertical });
      }
    }
  } else if (z.kind === 'plant') {
    const cell = 6;
    const cols = Math.max(1, Math.floor(iw / cell));
    const rows = Math.max(1, Math.floor(ih / cell));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const size = 3.4;
        out.push({ kind: 'machine', x: ix + (iw - cols * cell) / 2 + c * cell + (cell - size) / 2, y: iy + (ih - rows * cell) / 2 + r * cell + (cell - size) / 2, w: size, h: size });
      }
  } else if (z.kind === 'office') {
    const cw = 5;
    const ch = 4.2;
    const cols = Math.max(1, Math.floor(iw / cw));
    const rows = Math.max(1, Math.floor(ih / ch));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        out.push({ kind: 'desk', x: ix + (iw - cols * cw) / 2 + c * cw + 0.6, y: iy + (ih - rows * ch) / 2 + r * ch + 0.8, w: cw - 1.2, h: 1.6 });
  } else if (z.kind === 'welfare') {
    const cell = 5;
    const cols = Math.max(1, Math.floor(iw / cell));
    const rows = Math.max(1, Math.floor(ih / cell));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) out.push({ kind: 'table', x: ix + (iw - cols * cell) / 2 + c * cell + cell / 2, y: iy + (ih - rows * cell) / 2 + r * cell + cell / 2, w: 1.3, h: 1.3 });
  } else if (z.kind === 'yard' && z.w * z.h > 300) {
    // Parking bays along the side away from the building's long edge.
    const horizontal = z.w >= z.h;
    const bay = 2.6;
    const n = Math.floor(((horizontal ? z.w : z.h) - 4) / bay);
    for (let k = 0; k < n; k++)
      out.push(horizontal ? { kind: 'bay', x: z.x + 2 + k * bay, y: z.y + z.h - 6, w: bay, h: 5 } : { kind: 'bay', x: z.x + 1, y: z.y + 2 + k * bay, w: 5, h: bay });
  }
  return out;
}

/** Plan extent in grid units (every site uses the full grid). */
export const EXTENT = { w: GRID.w, h: GRID.h };
