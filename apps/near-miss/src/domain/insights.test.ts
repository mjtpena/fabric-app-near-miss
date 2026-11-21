/**
 * Acceptance 4 on the seeded data, the leading indicators and the Today ranking.
 */
import { DAY } from '@x10/shared/lib';
import { FIXED_NOW, testStore } from '@x10/shared/test';

import { personas } from '../app.config';
import { defs, type Action, type Report } from '../model';
import { seed } from '../seed';
import { coolingSincePeak, heatSeries, rankHotspots, zoneHeat } from './hotspots';
import { fixedOnTimeRate, lastMonths, medianDaysToFix, monthKey, monthlyIndicators, summarise } from './indicators';
import { loadAll } from './reports';
import { rankToday } from './today';

async function seeded() {
  const store = await testStore(defs, { personas, fn: seed, now: FIXED_NOW });
  return loadAll(store);
}

describe('acceptance 4: the loading dock hotspot', () => {
  it('is the top hotspot over 90 days at Northgate and across all sites', async () => {
    const data = await seeded();
    const north = data.sites.find((s) => s.name.startsWith('Northgate'))!;
    const top = rankHotspots(data.reports, data.zones.filter((z) => z.siteId === north.id), FIXED_NOW)[0];
    expect(top.zone.name).toBe('Loading dock');
    expect(rankHotspots(data.reports, data.zones, FIXED_NOW)[0].zone.name).toBe('Loading dock');
    expect(top.score).toBeGreaterThan(2 * rankHotspots(data.reports, data.zones, FIXED_NOW)[1].score);
  });

  it('formed, peaked before the fix and has cooled by more than 80% since', async () => {
    const data = await seeded();
    const dock = data.zones.find((z) => z.name === 'Loading dock')!;
    const from = FIXED_NOW.getTime() - 90 * DAY;
    const series = heatSeries(data.reports, dock.id, from, FIXED_NOW.getTime(), 1);
    const c = coolingSincePeak(series);
    const barrier = data.actions.find((a) => a.title.startsWith('Install a pedestrian barrier'))!;
    expect(c.peakAt).toBeLessThan(new Date(barrier.doneAt!).getTime());
    expect(c.drop).toBeGreaterThan(0.8);
    // Hottest zone on the whole plan at its peak; not any more today.
    const atPeak = zoneHeat(data.reports, c.peakAt);
    expect(Math.max(...atPeak.values())).toBe(atPeak.get(dock.id));
    const today = zoneHeat(data.reports, FIXED_NOW.getTime());
    expect(Math.max(...today.values())).toBeGreaterThan(today.get(dock.id) ?? 0);
  });

  it('this month the heat has moved to racking aisles E–H', async () => {
    const data = await seeded();
    expect(rankHotspots(data.reports, data.zones, FIXED_NOW, 30)[0].zone.name).toBe('Racking aisles E–H');
  });
});

describe('leading indicators (rule 5)', () => {
  const now = new Date('2026-11-20T09:00:00.000Z');
  const act = (due: number, done: number | null): Action => ({
    id: String(Math.random()),
    reportId: 'r',
    siteId: 's',
    title: 'Fix',
    ownerSub: 'o',
    ownerName: 'O',
    dueAt: new Date(now.getTime() + due * DAY).toISOString(),
    status: done === null ? 'open' : 'done',
    doneAt: done === null ? null : new Date(now.getTime() + done * DAY).toISOString(),
    verification: null,
    createdBySub: 'c',
    createdAt: now.toISOString(),
  });

  it('% fixed within due date counts done-on-time over known outcomes (open and not yet due is unknown)', () => {
    expect(fixedOnTimeRate([act(-5, -6), act(-5, -2), act(-1, null), act(3, null)], now)).toBeCloseTo(1 / 3);
    expect(fixedOnTimeRate([act(3, null)], now)).toBeNull();
    expect(fixedOnTimeRate([act(-1, -1)], now)).toBe(1);
  });

  it('median days to fix uses fixed reports only', () => {
    const r = (reported: number, fixed: number | null) =>
      ({ reportedAt: new Date(now.getTime() - reported * DAY).toISOString(), fixedAt: fixed === null ? null : new Date(now.getTime() - fixed * DAY).toISOString() }) as Report;
    expect(medianDaysToFix([r(10, 8), r(10, 4), r(10, 0), r(3, null)])).toBeCloseTo(6);
    expect(medianDaysToFix([r(3, null)])).toBeNull();
  });

  it('months are UTC calendar months, oldest first', () => {
    expect(monthKey('2026-11-30T23:30:00.000Z')).toBe('2026-11');
    expect(lastMonths(now, 4)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(lastMonths(new Date('2026-02-10T00:00:00Z'), 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('on the seed: monthly rows add up to the reports in those months, good catches counted', async () => {
    const data = await seeded();
    const rows = monthlyIndicators(data.reports, data.actions, FIXED_NOW, 4);
    expect(rows.map((r) => r.month)).toEqual(lastMonths(FIXED_NOW, 4));
    const months = new Set(rows.map((r) => r.month));
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(data.reports.filter((r) => months.has(monthKey(r.reportedAt))).length);
    const s = summarise(data.reports, data.actions, FIXED_NOW, 90);
    expect(s.reports).toBe(data.reports.length);
    expect(s.goodCatches).toBe(data.reports.filter((r) => r.kind === 'good_catch').length);
    expect(s.onTimeRate).toBeGreaterThan(0.5);
    expect(s.onTimeRate).toBeLessThan(1);
    expect(s.medianDays).toBeGreaterThan(0);
  });
});

describe('Today', () => {
  it('safety lead: the serious untriaged report comes first, then overdue actions; 3–5 items', async () => {
    const data = await seeded();
    const items = rankToday(data, { sub: 'demo-lead', isAdmin: true }, 'lead', null, FIXED_NOW);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items[0].title).toBe('Serious near miss untriaged at Despatch bay, Northgate');
    expect(items[0].tone).toBe('bad');
    expect(items.map((i) => i.id)).toContain('overdue-actions');
    expect(items.find((i) => i.id === 'overdue-actions')!.value).toBe('7');
    expect(items.some((i) => i.title === 'Racking aisles E–H is the hottest zone this month')).toBe(true);
    const cooled = items.find((i) => i.id.startsWith('cooled-'));
    expect(cooled?.title).toBe('Loading dock cooled after its fix');
    expect(cooled?.focus.kind).toBe('replay');
  });

  it('a supervisor sees only their own sites', async () => {
    const data = await seeded();
    const east = data.sites.find((s) => s.name === 'Eastside Plant')!;
    const items = rankToday(data, { sub: 'demo-tom', isAdmin: false }, 'supervisor', null, FIXED_NOW);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.every((i) => i.focus.siteId === east.id || i.focus.siteId === '')).toBe(true);
    // Overdue actions (bad) outrank a high report still inside its 4 h triage window (warn).
    expect(items[0].title).toBe('2 actions overdue');
    expect(items[1].title).toBe('High near miss to triage at Paint line');
    expect(items[1].unit).toBe('left to triage');
  });

  it('a reporter sees their own reports and the site around them', async () => {
    const data = await seeded();
    const north = data.sites.find((s) => s.name.startsWith('Northgate'))!;
    const items = rankToday(data, { sub: 'demo-sam', isAdmin: false }, 'reporter', north.id, FIXED_NOW);
    expect(items.some((i) => i.id === 'mine-open')).toBe(true);
    expect(items.some((i) => i.id.startsWith('mine-fixed'))).toBe(true);
    expect(items.some((i) => i.id === 'overdue-actions')).toBe(false);
  });
});
