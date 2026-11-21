import type { Zone } from '../model';
import { drawPlan, fixturesOf, zoneAtPoint } from './geometry';

const z = (id: string, kind: Zone['kind'], x: number, y: number, w: number, h: number, name = id): Zone => ({ id, siteId: 's', name, kind, x, y, w, h });

describe('plan geometry', () => {
  const zones = [
    z('a-yard', 'yard', 0, 0, 20, 24),
    z('b-dock', 'dock', 20, 12, 24, 12),
    z('c-room', 'room', 20, 0, 24, 12),
    z('d-route', 'route', 0, 24, 44, 6),
  ];

  it('finds the zone under a point, preferring the smallest', () => {
    expect(zoneAtPoint(zones, 30, 18)?.id).toBe('b-dock');
    expect(zoneAtPoint(zones, 30, 26)?.id).toBe('d-route');
    expect(zoneAtPoint(zones, 99, 59)).toBeNull();
  });

  it('numbers dock doors along the dock’s longest exterior wall (facing the yard) and parks trailers outside', () => {
    const d = drawPlan(zones, 'warehouse');
    expect(d.dockDoors.map((x) => x.n)).toEqual([1, 2, 3, 4]);
    expect(d.dockDoors.every((x) => x.x === 20 && x.nx === -1)).toBe(true);
    expect(d.trailers.length).toBe(2);
    expect(d.trailers.every((t) => t.x + t.w <= 20)).toBe(true);
  });

  it('opens docks onto vehicle routes (no wall) and walls rooms off with a door', () => {
    const d = drawPlan(zones, 'warehouse');
    expect(d.walls.some((w) => w.kind === 'open' && w.y1 === 24 && w.y2 === 24 && w.x1 >= 20)).toBe(true);
    expect(d.walls.some((w) => w.kind === 'interior' && w.y1 === 12 && w.y2 === 12)).toBe(true);
    expect(d.doors.length).toBeGreaterThan(0);
    expect(d.walls.some((w) => w.kind === 'fence')).toBe(true);
    // A zebra crossing where the route meets the dock.
    expect(d.crossings).toHaveLength(1);
  });

  it('offices have corridors, not vehicle routes: nothing opens onto them and no crossings', () => {
    const d = drawPlan(zones, 'office');
    expect(d.walls.some((w) => w.kind === 'open')).toBe(false);
    expect(d.crossings).toHaveLength(0);
  });

  it('draws fixtures by zone kind: racks in stores, machines in plant, lane markings on routes', () => {
    expect(fixturesOf(z('s', 'store', 0, 0, 30, 24), 'warehouse').every((f) => f.kind === 'rack')).toBe(true);
    expect(fixturesOf(z('p', 'plant', 0, 0, 30, 24), 'plant').some((f) => f.kind === 'machine')).toBe(true);
    expect(fixturesOf(z('r', 'route', 0, 0, 100, 6), 'warehouse').some((f) => f.kind === 'chevron')).toBe(true);
    expect(fixturesOf(z('r', 'route', 0, 0, 100, 6), 'office')).toEqual([]);
    expect(fixturesOf(z('tiny', 'office', 0, 0, 3, 3), 'office')).toEqual([]);
  });
});
