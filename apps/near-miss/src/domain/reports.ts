/**
 * Data access and the permission checks around every write. Components call these; they never touch the store.
 * Rules that the row policies cannot express (site supervisor triage, reporter edits, anonymity) are enforced here,
 * so they hold in demo mode and in Fabric alike.
 */
import { PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { checkText, toMs } from '@x10/shared/lib';

import { categoryLabels } from '../config';
import {
  CATEGORIES,
  GRID,
  KINDS,
  limits,
  POTENTIALS,
  type Action,
  type Category,
  type Potential,
  type Report,
  type ReportKind,
  type ReportStatus,
  type Schema,
  type Site,
  type Zone,
} from '../model';
import { checkEdit, checkTransition } from './rules';

type Store = DataStore<Schema>;

/* ------------------------------------------------------------------ roles */

export type Role = 'reporter' | 'supervisor' | 'lead';

export const isLead = (me: Pick<Person, 'isAdmin'>) => me.isAdmin === true;
export const supervises = (me: Pick<Person, 'sub'>, site: Pick<Site, 'supervisorSub'>) => site.supervisorSub === me.sub;
/** Site supervisors triage and assign actions for their own site; the safety lead (admin) for every site. */
export const canTriage = (me: Pick<Person, 'sub' | 'isAdmin'>, site: Pick<Site, 'supervisorSub'>) => isLead(me) || supervises(me, site);

/** The role a person naturally views the plan as. */
export function homeRole(me: Pick<Person, 'sub' | 'isAdmin'>, sites: Site[]): Role {
  if (isLead(me)) return 'lead';
  return sites.some((s) => supervises(me, s)) ? 'supervisor' : 'reporter';
}

/* ------------------------------------------------------------------ reads */

export interface PlanData {
  sites: Site[];
  zones: Zone[];
  reports: Report[];
  actions: Action[];
  people: Person[];
}

export async function loadAll(store: Store): Promise<PlanData> {
  const [sites, zones, reports, actions, people] = await Promise.all([
    store.repo('Site').list({ orderBy: { field: 'name' } }),
    store.repo('Zone').list(),
    store.repo('Report').list({ orderBy: { field: 'reportedAt', dir: 'desc' } }),
    store.repo('Action').list({ orderBy: { field: 'dueAt' } }),
    store.repo('Person').list({ orderBy: { field: 'displayName' } }),
  ]);
  return { sites, zones, reports, actions, people };
}

export async function loadSites(store: Store): Promise<Pick<PlanData, 'sites' | 'zones'>> {
  const [sites, zones] = await Promise.all([store.repo('Site').list({ orderBy: { field: 'name' } }), store.repo('Zone').list()]);
  return { sites, zones };
}

/** A supervisor's triage queue: new reports at the sites they supervise (all sites for the safety lead). */
export function triageQueue(data: Pick<PlanData, 'sites' | 'reports'>, me: Pick<Person, 'sub' | 'isAdmin'>): Report[] {
  const mine = new Set(data.sites.filter((s) => canTriage(me, s)).map((s) => s.id));
  return data.reports.filter((r) => r.status === 'new' && mine.has(r.siteId));
}

export function zoneAt(zones: Zone[], x: number, y: number): Zone | null {
  // Routes are drawn under rooms; prefer the smallest rectangle that contains the point.
  const hits = zones.filter((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
  return hits.sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null;
}

/* ------------------------------------------------------------------ filing a report */

export interface ReportInput {
  siteId: string;
  zoneId: string | null;
  kind: ReportKind;
  category: Category | null;
  potential: Potential | null;
  description: string;
  immediateAction: string;
  anonymous: boolean;
  x: number | null;
  y: number | null;
}

export type ReportErrors = Partial<Record<'zoneId' | 'category' | 'potential' | 'description' | 'immediateAction', string>>;

export function validateReport(input: ReportInput): ReportErrors {
  const e: ReportErrors = {};
  if (!input.zoneId) e.zoneId = 'Tap where it happened on the plan.';
  if (!input.category || !CATEGORIES.includes(input.category)) e.category = 'Choose what kind of hazard it was.';
  if (!input.potential || !POTENTIALS.includes(input.potential)) e.potential = 'Choose how bad it could have been.';
  const d = checkText(input.description, { ...limits.description, label: 'Description' });
  if (d) e.description = d;
  const ia = checkText(input.immediateAction, { ...limits.immediateAction, label: 'What you did', optional: true });
  if (ia) e.immediateAction = ia;
  return e;
}

/**
 * The record exactly as it will be stored. When anonymous, the reporter fields are not set at all (no sub, no name,
 * nothing else derived from the reporter), so nobody, including the safety lead, can see who reported it.
 */
export function buildReportRecord(input: ReportInput, me: Pick<Person, 'sub' | 'displayName'>, now: Date): Omit<Report, 'id'> {
  const base = {
    siteId: input.siteId,
    zoneId: input.zoneId,
    kind: input.kind,
    category: input.category as Category,
    potential: input.potential as Potential,
    description: input.description.trim(),
    immediateAction: input.immediateAction.trim() || null,
    anonymous: input.anonymous,
    reportedAt: now.toISOString(),
    status: 'new' as const,
    triagedBy: null,
    triagedByName: null,
    triagedAt: null,
    fixedAt: null,
    closedAt: null,
    x: input.x === null ? null : Math.round(Math.min(GRID.w, Math.max(0, input.x))),
    y: input.y === null ? null : Math.round(Math.min(GRID.h, Math.max(0, input.y))),
  };
  if (input.anonymous) return { ...base, reporterSub: null, reporterName: null };
  return { ...base, reporterSub: me.sub, reporterName: me.displayName };
}

export async function fileReport(store: Store, me: Person, input: ReportInput, now = new Date()): Promise<Report> {
  const errors = validateReport(input);
  const first = Object.values(errors)[0];
  if (first) throw new RuleError(first);
  if (!KINDS.includes(input.kind)) throw new RuleError('Choose the kind of report.');
  const site = await store.repo('Site').get(input.siteId);
  if (!site) throw new RuleError('That site no longer exists.');
  const zone = input.zoneId ? await store.repo('Zone').get(input.zoneId) : null;
  if (!zone || zone.siteId !== site.id) throw new RuleError('That zone is not on this site’s plan.');
  const record = buildReportRecord(input, me, now);
  // An anonymous create sends reporterSub and reporterName as explicit nulls (nothing about the reporter is sent or
  // stored). They must be present: Fabric rejects a create whose body omits a field the row policy references
  // ("One or more fields referenced by the database policy are not present in the request body").
  const payload = Object.fromEntries(
    Object.entries(record).filter(([k, v]) => v !== null || k === 'reporterSub' || k === 'reporterName'),
  ) as unknown as Omit<Report, 'id'>;
  return store.repo('Report').create(payload);
}

export async function editReport(
  store: Store,
  me: Person,
  id: string,
  patch: Pick<ReportInput, 'description' | 'immediateAction' | 'category' | 'potential' | 'kind'>,
): Promise<Report> {
  const r = await store.repo('Report').get(id);
  if (!r) throw new RuleError('That report no longer exists.');
  const why = checkEdit(r, me.sub);
  if (why) throw new PermissionError(why);
  const errors = validateReport({ ...r, ...patch, immediateAction: patch.immediateAction ?? '' } as ReportInput);
  const first = Object.values(errors)[0];
  if (first) throw new RuleError(first);
  return store.repo('Report').update(id, {
    description: patch.description.trim(),
    immediateAction: patch.immediateAction.trim() || null,
    category: patch.category as Category,
    potential: patch.potential as Potential,
    kind: patch.kind,
  });
}

/* ------------------------------------------------------------------ triage and actions */

async function loadForTriage(store: Store, me: Person, reportId: string) {
  const r = await store.repo('Report').get(reportId);
  if (!r) throw new RuleError('That report no longer exists.');
  const site = await store.repo('Site').get(r.siteId);
  if (!site) throw new RuleError('That report’s site no longer exists.');
  if (!canTriage(me, site)) throw new PermissionError(`Only ${site.supervisorName} (the site supervisor) or the safety lead can triage reports at ${site.name}.`);
  const actions = await store.repo('Action').list({ where: { reportId } });
  return { r, site, actions };
}

export interface TriageInput {
  potential: Potential;
  category: Category;
}

/** Confirm (or correct) the potential and category and stamp who triaged it and when. */
export async function triageReport(store: Store, me: Person, reportId: string, input: TriageInput, now = new Date()): Promise<Report> {
  const { r, actions } = await loadForTriage(store, me, reportId);
  const why = checkTransition(r, 'triaged', actions);
  if (why) throw new RuleError(why);
  if (!POTENTIALS.includes(input.potential) || !CATEGORIES.includes(input.category)) throw new RuleError('Choose a potential and a category.');
  return store.repo('Report').update(reportId, {
    status: 'triaged',
    potential: input.potential,
    category: input.category,
    triagedBy: me.sub,
    triagedByName: me.displayName,
    triagedAt: now.toISOString(),
  });
}

export interface ActionInput {
  title: string;
  ownerSub: string;
  dueAt: string;
}

export type ActionErrors = Partial<Record<'title' | 'ownerSub' | 'dueAt', string>>;

export function validateAction(input: ActionInput, people: Pick<Person, 'sub'>[], now: Date): ActionErrors {
  const e: ActionErrors = {};
  const t = checkText(input.title, { ...limits.actionTitle, label: 'Action' });
  if (t) e.title = t;
  if (!people.some((p) => p.sub === input.ownerSub)) e.ownerSub = 'Choose who will fix it.';
  if (!input.dueAt || Number.isNaN(toMs(input.dueAt))) e.dueAt = 'Choose a due date.';
  else if (toMs(input.dueAt) < now.getTime() - 60_000) e.dueAt = 'The due date is in the past.';
  return e;
}

/** Assign a fix. A new report is triaged by the same step; the report moves to "action assigned". */
export async function assignAction(store: Store, me: Person, reportId: string, input: ActionInput, now = new Date()): Promise<Action> {
  const { r, actions } = await loadForTriage(store, me, reportId);
  if (r.status === 'fixed' || r.status === 'closed') throw new RuleError('This report is already fixed.');
  const people = await store.repo('Person').list();
  const errors = validateAction(input, people, now);
  const first = Object.values(errors)[0];
  if (first) throw new RuleError(first);
  const owner = people.find((p) => p.sub === input.ownerSub)!;
  const action = await store.repo('Action').create({
    reportId,
    siteId: r.siteId,
    title: input.title.trim(),
    ownerSub: owner.sub,
    ownerName: owner.displayName,
    dueAt: input.dueAt,
    status: 'open',
    doneAt: null,
    verification: null,
    createdBySub: me.sub,
    createdAt: now.toISOString(),
  });
  const why = checkTransition(r, 'action_assigned', [...actions, action]);
  if (!why) {
    await store.repo('Report').update(reportId, {
      status: 'action_assigned',
      ...(r.status === 'new' ? { triagedBy: me.sub, triagedByName: me.displayName, triagedAt: now.toISOString() } : {}),
    });
  }
  return action;
}

/** The owner marks their action done with what they did. The last open action done marks the report fixed. */
export async function completeAction(store: Store, me: Person, actionId: string, verification: string, now = new Date()): Promise<Action> {
  const a = await store.repo('Action').get(actionId);
  if (!a) throw new RuleError('That action no longer exists.');
  if (a.ownerSub !== me.sub) throw new PermissionError(`Only ${a.ownerName} can mark this action done.`);
  if (a.status === 'done') throw new RuleError('This action is already done.');
  const v = checkText(verification, { ...limits.verification, label: 'What was done', optional: true });
  if (v) throw new RuleError(v);
  const done = await store.repo('Action').update(actionId, { status: 'done', doneAt: now.toISOString(), verification: verification.trim() || null });
  const siblings = await store.repo('Action').list({ where: { reportId: a.reportId } });
  const report = await store.repo('Report').get(a.reportId);
  if (report && report.status === 'action_assigned' && siblings.every((s) => s.status === 'done')) {
    await store.repo('Report').update(report.id, { status: 'fixed', fixedAt: now.toISOString() });
  }
  return done;
}

/** Move a report to fixed or closed (supervisor or safety lead), subject to rule 2 and open actions. */
export async function setStatus(store: Store, me: Person, reportId: string, to: Extract<ReportStatus, 'fixed' | 'closed'>, now = new Date()): Promise<Report> {
  const { r, actions } = await loadForTriage(store, me, reportId);
  const why = checkTransition(r, to, actions);
  if (why) throw new RuleError(why);
  const stamp = now.toISOString();
  return store.repo('Report').update(reportId, {
    status: to,
    ...(to === 'fixed' || !r.fixedAt ? { fixedAt: r.fixedAt ?? stamp } : {}),
    ...(to === 'closed' ? { closedAt: stamp } : {}),
  });
}

/* ------------------------------------------------------------------ display helpers */

export function reporterLabel(r: Pick<Report, 'anonymous' | 'reporterName'>): string {
  return r.anonymous || !r.reporterName ? 'Anonymous' : r.reporterName;
}

/** One-line title for a report: "Near miss · Vehicles and pedestrians". */
export function reportTitle(r: Pick<Report, 'description'>): string {
  const first = r.description.split(/(?<=[.!?])\s/)[0];
  return first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first;
}

export const categoryOf = (c: Category) => categoryLabels[c];
