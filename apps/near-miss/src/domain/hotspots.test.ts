import { DAY } from '@x10/shared/lib';

import { FIXED_HEAT_FACTOR, HEAT_HALF_LIFE_DAYS, HOTSPOT_WEIGHTS } from '../config';
import type { Report, Zone } from '../model';
import { coolingSincePeak, heatOf, heatSeries, inWindow, peakHeat, rankHotspots, statusAt, zoneHeat } from './hotspots';

const NOW = new Date('2026-11-20T09:00:00.000Z');
const ago = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();

const zone = (id: string, name = id): Zone => ({ id, siteId: 's', name, kind: 'room', x: 0, y: 0, w: 10, h: 10 });
let n = 0;
function rep(zoneId: string | null, potential: Report['potential'], daysAgo: number, p: Partial<Report> = {}): Report {
  n += 1;
  return {
    id: `r${n}`,
    siteId: 's',
    zoneId,
    kind: 'near_miss',
    category: 'other',
    potential,
    description: 'Something nearly happened.',
    immediateAction: null,
    anonymous: true,
    reporterSub: null,
    reporterName: null,
    reportedAt: ago(daysAgo),
    status: 'new',
    triagedBy: null,
    triagedByName: null,
    triagedAt: null,
    fixedAt: null,
    closedAt: null,
    x: null,
    y: null,
    ...p,
  };
}

describe('rankHotspots (rule 4)', () => {
  it('weights serious 8, high 4, medium 2, low 1', () => {
    expect(HOTSPOT_WEIGHTS).toEqual({ serious: 8, high: 4, medium: 2, low: 1 });
    const zones = [zone('a'), zone('b')];
    const reports = [rep('a', 'serious', 1), rep('b', 'low', 1), rep('b', 'low', 2), rep('b', 'medium', 3), rep('b', 'high', 4)];
    const ranked = rankHotspots(reports, zones, NOW);
    // Equal scores (8 each): the zone with more reports ranks first.
    expect(ranked.map((h) => [h.zone.id, h.score, h.count])).toEqual([
      ['b', 8, 4],
      ['a', 8, 1],
    ]);
    expect(ranked[0].byPotential).toEqual({ low: 2, medium: 1, high: 1, serious: 0 });
  });

  it('breaks ties by count, then by name', () => {
    const zones = [zone('z2', 'Bay'), zone('z1', 'Apron')];
    const ranked = rankHotspots([rep('z2', 'high', 1), rep('z1', 'high', 1)], zones, NOW);
    expect(ranked.map((h) => h.zone.name)).toEqual(['Apron', 'Bay']);
  });

  it('counts the last 90 days only: exactly 90 days ago is out, the future is out', () => {
    expect(inWindow(ago(90), NOW, 90)).toBe(false);
    expect(inWindow(ago(89.999), NOW, 90)).toBe(true);
    expect(inWindow(ago(-0.01), NOW, 90)).toBe(false);
    const ranked = rankHotspots([rep('a', 'serious', 90), rep('a', 'low', 89), rep('a', 'high', -1)], [zone('a')], NOW);
    expect(ranked[0].score).toBe(1);
  });

  it('ignores reports with no zone or a zone from another site; empty in, empty out', () => {
    expect(rankHotspots([rep(null, 'serious', 1), rep('elsewhere', 'serious', 1)], [zone('a')], NOW)).toEqual([]);
    expect(rankHotspots([], [zone('a')], NOW)).toEqual([]);
  });

  it('honours a shorter window (hottest this month)', () => {
    const reports = [rep('a', 'serious', 40), rep('b', 'medium', 5)];
    expect(rankHotspots(reports, [zone('a'), zone('b')], NOW, 30).map((h) => h.zone.id)).toEqual(['b']);
  });
});

describe('live heat', () => {
  it('starts at the weight, halves every half-life and is zero before the report', () => {
    const r = rep('a', 'serious', 0);
    const t0 = NOW.getTime();
    expect(heatOf(r, t0)).toBe(8);
    expect(heatOf(r, t0 + HEAT_HALF_LIFE_DAYS * DAY)).toBeCloseTo(4);
    expect(heatOf(r, t0 - 1)).toBe(0);
  });

  it('drops to the fixed factor once fixed', () => {
    const r = rep('a', 'high', 0, { fixedAt: ago(-1) });
    const t = NOW.getTime() + 2 * DAY;
    expect(heatOf(r, t)).toBeCloseTo(4 * 0.5 ** (2 / HEAT_HALF_LIFE_DAYS) * FIXED_HEAT_FACTOR);
  });

  it('sums per zone, forms and then cools after a fix', () => {
    const reports = [10, 9, 8, 7, 6, 5].map((d) => rep('dock', 'serious', 40 + d, { fixedAt: ago(35) }));
    const from = NOW.getTime() - 90 * DAY;
    const series = heatSeries(reports, 'dock', from, NOW.getTime(), 1);
    const c = coolingSincePeak(series);
    expect(c.peak).toBeGreaterThan(30);
    expect(c.peakAt).toBeLessThan(NOW.getTime() - 35 * DAY);
    expect(c.drop).toBeGreaterThan(0.9);
    expect(zoneHeat(reports, NOW.getTime()).get('dock')).toBeCloseTo(c.now);
    expect(peakHeat(reports, from, NOW.getTime())).toBeCloseTo(c.peak);
    expect(coolingSincePeak([])).toMatchObject({ peak: 0, drop: 0 });
  });
});

describe('statusAt (replay)', () => {
  it('rebuilds the status on a past day from the timestamps', () => {
    const r = rep('a', 'high', 10, {
      status: 'closed',
      triagedAt: ago(9.9),
      fixedAt: ago(4),
      closedAt: ago(2),
    });
    const actions = [{ reportId: r.id, createdAt: ago(9) }];
    const t = (d: number) => NOW.getTime() - d * DAY;
    expect(statusAt(r, actions, t(11))).toBeNull();
    expect(statusAt(r, actions, t(9.95))).toBe('new');
    expect(statusAt(r, actions, t(9.5))).toBe('triaged');
    expect(statusAt(r, actions, t(8))).toBe('action_assigned');
    expect(statusAt(r, actions, t(3))).toBe('fixed');
    expect(statusAt(r, actions, t(0))).toBe('closed');
  });
});
