import { DAY } from '@x10/shared/lib';
import { FIXED_NOW, testStore } from '@x10/shared/test';

import { personas } from '../app.config';
import { defs, type Report } from '../model';
import { seed } from '../seed';
import {
  assignAction,
  buildReportRecord,
  canTriage,
  completeAction,
  editReport,
  fileReport,
  homeRole,
  loadAll,
  reporterLabel,
  setStatus,
  triageQueue,
  triageReport,
  validateReport,
  zoneAt,
  type ReportInput,
} from './reports';
import { ANONYMOUS_CANNOT_EDIT, SERIOUS_NEEDS_ACTION } from './rules';

async function setup() {
  const store = await testStore(defs, { personas, fn: seed, now: FIXED_NOW });
  const data = await loadAll(store);
  const who = (sub: string) => data.people.find((p) => p.sub === sub)!;
  const north = data.sites.find((s) => s.name === 'Northgate Distribution Centre')!;
  const east = data.sites.find((s) => s.name === 'Eastside Plant')!;
  const dock = data.zones.find((z) => z.siteId === north.id && z.name === 'Loading dock')!;
  return { store, data, who, north, east, dock, lead: who('demo-lead'), priya: who('demo-priya'), tom: who('demo-tom'), sam: who('demo-sam') };
}

function input(siteId: string, zoneId: string, p: Partial<ReportInput> = {}): ReportInput {
  return {
    siteId,
    zoneId,
    kind: 'near_miss',
    category: 'vehicles_pedestrians',
    potential: 'high',
    description: 'Forklift came round the corner as I stepped out.',
    immediateAction: '',
    anonymous: false,
    x: 25,
    y: 20,
    ...p,
  };
}

describe('anonymous reports (acceptance 2)', () => {
  it('the record built for an anonymous report has no reporter fields at all', () => {
    const rec = buildReportRecord(input('s', 'z', { anonymous: true }), { sub: 'demo-sam', displayName: 'Sam Taylor' }, FIXED_NOW);
    expect(rec.reporterSub).toBeNull();
    expect(rec.reporterName).toBeNull();
    expect(JSON.stringify(rec)).not.toMatch(/demo-sam|Sam Taylor/);
  });

  it('stores no reporter fields: the stored row carries nothing that identifies the reporter', async () => {
    const { store, north, dock, sam } = await setup();
    const created = await fileReport(store, sam, input(north.id, dock.id, { anonymous: true }), FIXED_NOW);
    const raw = store.dump().Report.find((r) => r.id === created.id)!;
    expect(raw.anonymous).toBe(true);
    expect(raw.reporterSub ?? null).toBeNull();
    expect(raw.reporterName ?? null).toBeNull();
    expect(raw.triagedBy ?? null).toBeNull();
    // No other column holds the reporter's sub, name or email.
    for (const v of Object.values(raw)) {
      expect(String(v)).not.toMatch(/demo-sam|Sam Taylor|sam@example\.com/);
    }
    expect(reporterLabel(created)).toBe('Anonymous');
  });

  it('cannot be edited, not even by the person who filed it', async () => {
    const { store, north, dock, sam } = await setup();
    const created = await fileReport(store, sam, input(north.id, dock.id, { anonymous: true }), FIXED_NOW);
    await expect(
      editReport(store, sam, created.id, { description: 'Changed my mind about this.', immediateAction: '', category: 'other', potential: 'low', kind: 'near_miss' }),
    ).rejects.toThrow(ANONYMOUS_CANNOT_EDIT);
  });

  it('named reports store the reporter and can be edited by them while new', async () => {
    const { store, north, dock, sam, priya } = await setup();
    const created = await fileReport(store, sam, input(north.id, dock.id), FIXED_NOW);
    expect(created).toMatchObject({ reporterSub: 'demo-sam', reporterName: 'Sam Taylor', status: 'new', anonymous: false });
    const edited = await editReport(store, sam, created.id, {
      description: 'Forklift came round the corner fast as I stepped out.',
      immediateAction: 'Told the driver.',
      category: 'vehicles_pedestrians',
      potential: 'serious',
      kind: 'near_miss',
    });
    expect(edited.potential).toBe('serious');
    await expect(
      editReport(store, priya, created.id, { description: 'Someone else edits it.', immediateAction: '', category: 'other', potential: 'low', kind: 'near_miss' }),
    ).rejects.toThrow(/Only the person/);
  });
});

describe('filing', () => {
  it('validates with the entity limits and requires a zone, category and potential', () => {
    const e = validateReport({ ...input('s', ''), zoneId: null, category: null, potential: null, description: 'short' });
    expect(Object.keys(e).sort()).toEqual(['category', 'description', 'potential', 'zoneId']);
    expect(validateReport(input('s', 'z', { description: 'x'.repeat(1001) })).description).toMatch(/1000/);
  });

  it('rejects a zone from another site', async () => {
    const { store, east, dock, sam } = await setup();
    await expect(fileReport(store, sam, input(east.id, dock.id), FIXED_NOW)).rejects.toThrow(/not on this site/);
  });

  it('finds the zone under a tap, preferring the smallest rectangle', async () => {
    const { data, north } = await setup();
    const zones = data.zones.filter((z) => z.siteId === north.id);
    expect(zoneAt(zones, 30, 20)?.name).toBe('Loading dock');
    expect(zoneAt(zones, 30, 6)?.name).toBe('Marshalling area');
    expect(zoneAt(zones, 50, 26)?.name).toBe('Forklift route');
    expect(zoneAt(zones, 200, 200)).toBeNull();
  });
});

describe('triage and actions', () => {
  it('a supervisor triages only their own site; the safety lead triages any (acceptance 5)', async () => {
    const { store, data, north, east, priya, lead, tom } = await setup();
    expect(canTriage(priya, north)).toBe(true);
    expect(canTriage(priya, east)).toBe(false);
    expect(canTriage(lead, east)).toBe(true);
    const eastNew = data.reports.find((r) => r.siteId === east.id && r.status === 'new')!;
    await expect(triageReport(store, priya, eastNew.id, { potential: 'high', category: 'fire' }, FIXED_NOW)).rejects.toThrow(/Only Tom Okoro/);
    const ok = await triageReport(store, tom, eastNew.id, { potential: 'high', category: 'fire' }, FIXED_NOW);
    expect(ok).toMatchObject({ status: 'triaged', triagedBy: 'demo-tom', triagedByName: 'Tom Okoro' });

    const queue = triageQueue(data, priya);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((r) => r.siteId === north.id)).toBe(true);
    expect(triageQueue(data, lead).some((r) => r.siteId === east.id)).toBe(true);
    expect(homeRole(lead, data.sites)).toBe('lead');
    expect(homeRole(priya, data.sites)).toBe('supervisor');
    expect(homeRole({ sub: 'demo-sam', isAdmin: false }, data.sites)).toBe('reporter');
  });

  it('a serious report cannot move past triaged without an action (acceptance 3)', async () => {
    const { store, north, dock, sam, priya } = await setup();
    const r = await fileReport(store, sam, input(north.id, dock.id, { potential: 'serious' }), FIXED_NOW);
    await triageReport(store, priya, r.id, { potential: 'serious', category: 'vehicles_pedestrians' }, FIXED_NOW);
    await expect(setStatus(store, priya, r.id, 'fixed', FIXED_NOW)).rejects.toThrow(SERIOUS_NEEDS_ACTION);
    await expect(setStatus(store, priya, r.id, 'closed', FIXED_NOW)).rejects.toThrow(SERIOUS_NEEDS_ACTION);

    const action = await assignAction(store, priya, r.id, { title: 'Barrier at the crossing', ownerSub: 'demo-sam', dueAt: new Date(FIXED_NOW.getTime() + 2 * DAY).toISOString() }, FIXED_NOW);
    expect((await store.repo('Report').get(r.id))!.status).toBe('action_assigned');
    await expect(setStatus(store, priya, r.id, 'fixed', FIXED_NOW)).rejects.toThrow(/Finish the open action/);
    // Only the owner can complete it; completing the last action marks the report fixed.
    await expect(completeAction(store, priya, action.id, 'Done', FIXED_NOW)).rejects.toThrow(/Only Sam Taylor/);
    await completeAction(store, sam, action.id, 'Barrier fitted.', FIXED_NOW);
    const fixed = (await store.repo('Report').get(r.id))!;
    expect(fixed.status).toBe('fixed');
    expect(fixed.fixedAt).toBe(FIXED_NOW.toISOString());
    const closed = await setStatus(store, priya, r.id, 'closed', FIXED_NOW);
    expect(closed.status).toBe('closed');
  });

  it('assigning an action to a new report triages it in the same step', async () => {
    const { store, north, dock, sam, priya } = await setup();
    const r = await fileReport(store, sam, input(north.id, dock.id, { potential: 'low' }), FIXED_NOW);
    await assignAction(store, priya, r.id, { title: 'Sweep the dock', ownerSub: 'demo-sam', dueAt: new Date(FIXED_NOW.getTime() + DAY).toISOString() }, FIXED_NOW);
    expect((await store.repo('Report').get(r.id))!).toMatchObject({ status: 'action_assigned', triagedBy: 'demo-priya' });
  });

  it('validates actions: title length, a known owner, a due date not in the past', async () => {
    const { store, north, dock, sam, priya } = await setup();
    const r = await fileReport(store, sam, input(north.id, dock.id), FIXED_NOW);
    const due = new Date(FIXED_NOW.getTime() + DAY).toISOString();
    await expect(assignAction(store, priya, r.id, { title: 'ab', ownerSub: 'demo-sam', dueAt: due }, FIXED_NOW)).rejects.toThrow(/at least 3/);
    await expect(assignAction(store, priya, r.id, { title: 'Fix it', ownerSub: 'nobody', dueAt: due }, FIXED_NOW)).rejects.toThrow(/who will fix/);
    await expect(
      assignAction(store, priya, r.id, { title: 'Fix it', ownerSub: 'demo-sam', dueAt: new Date(FIXED_NOW.getTime() - DAY).toISOString() }, FIXED_NOW),
    ).rejects.toThrow(/past/);
  });
});

describe('seed', () => {
  it('has three sites with 8–12 zones, ~70 reports, ~40 actions, anonymous reports and good catches', async () => {
    const { data } = await setup();
    expect(data.sites.map((s) => s.name).sort()).toEqual(['Eastside Plant', 'Harbour Office', 'Northgate Distribution Centre']);
    for (const s of data.sites) {
      const n = data.zones.filter((z) => z.siteId === s.id).length;
      expect(n).toBeGreaterThanOrEqual(8);
      expect(n).toBeLessThanOrEqual(12);
    }
    expect(data.reports.length).toBeGreaterThanOrEqual(65);
    expect(data.reports.length).toBeLessThanOrEqual(80);
    expect(data.actions.length).toBeGreaterThanOrEqual(38);
    const anon = data.reports.filter((r) => r.anonymous);
    expect(anon.length).toBeGreaterThan(15);
    expect(anon.every((r) => r.reporterSub === null && r.reporterName === null)).toBe(true);
    expect(data.reports.filter((r) => r.kind === 'good_catch').length).toBeGreaterThanOrEqual(5);
    for (const s of ['new', 'triaged', 'action_assigned', 'fixed', 'closed'] as Report['status'][]) {
      expect(data.reports.some((r) => r.status === s)).toBe(true);
    }
    // Every pin sits inside its zone.
    for (const r of data.reports) {
      const z = data.zones.find((x) => x.id === r.zoneId)!;
      expect(r.x! >= z.x && r.x! <= z.x + z.w && r.y! >= z.y && r.y! <= z.y + z.h).toBe(true);
    }
  });

  it('is consistent with the rules: serious reports past triaged have actions; fixed reports have no open actions', async () => {
    const { data } = await setup();
    for (const r of data.reports) {
      const acts = data.actions.filter((a) => a.reportId === r.id);
      if (r.potential === 'serious' && !['new', 'triaged'].includes(r.status)) expect(acts.length).toBeGreaterThan(0);
      if (r.status === 'fixed' || r.status === 'closed') expect(acts.every((a) => a.status === 'done')).toBe(true);
      if (r.status === 'action_assigned') expect(acts.some((a) => a.status === 'open')).toBe(true);
      if (r.status !== 'new') expect(r.triagedAt).not.toBeNull();
    }
  });
});
