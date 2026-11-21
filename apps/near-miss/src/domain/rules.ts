/**
 * Pure rules: the triage clock, report status transitions, action due dates and overdue state, and who may edit.
 * No store access here; src/domain/reports.ts calls these before every write, so the rules hold in demo and Fabric.
 */
import { DAY, HOUR, toMs } from '@x10/shared/lib';

import { ACTION_DUE_DAYS, statusLabels, TRIAGE_HOURS, URGENT_POTENTIALS, URGENT_TRIAGE_HOURS } from '../config';
import { STATUSES, type Action, type Potential, type Report, type ReportStatus } from '../model';

/* ------------------------------------------------------------------ triage clock (rule 1) */

export function triageLimitHours(potential: Potential): number {
  return URGENT_POTENTIALS.includes(potential) ? URGENT_TRIAGE_HOURS : TRIAGE_HOURS;
}

export function triageDeadline(r: Pick<Report, 'reportedAt' | 'potential'>): string {
  return new Date(toMs(r.reportedAt) + triageLimitHours(r.potential) * HOUR).toISOString();
}

export type TriageState = 'waiting' | 'late' | 'on_time' | 'triaged_late';

export interface TriageClock {
  state: TriageState;
  deadline: string;
  /** Waiting: time left (negative once late). Triaged: how early (positive) or late (negative) it was. */
  marginMs: number;
}

/** Where a report stands against its triage deadline. A report waits for triage while its status is "new". */
export function triageClock(r: Pick<Report, 'reportedAt' | 'potential' | 'status' | 'triagedAt'>, now: Date): TriageClock {
  const deadline = triageDeadline(r);
  const due = toMs(deadline);
  if (r.status === 'new' || !r.triagedAt) {
    const left = due - now.getTime();
    return { state: left >= 0 ? 'waiting' : 'late', deadline, marginMs: left };
  }
  const margin = due - toMs(r.triagedAt);
  return { state: margin >= 0 ? 'on_time' : 'triaged_late', deadline, marginMs: margin };
}

/** Untriaged and past the deadline: shows in Today. */
export function isTriageLate(r: Report, now: Date): boolean {
  return triageClock(r, now).state === 'late';
}

/* ------------------------------------------------------------------ actions (rule 3) */

export function defaultDueDays(potential: Potential): number {
  return ACTION_DUE_DAYS[potential];
}

export function defaultDueAt(potential: Potential, from: Date): string {
  return new Date(from.getTime() + defaultDueDays(potential) * DAY).toISOString();
}

export type ActionState = 'open' | 'overdue' | 'done' | 'done_late';

/** Overdue is computed, never stored: open and past its due date. */
export function actionState(a: Pick<Action, 'status' | 'dueAt' | 'doneAt'>, now: Date): ActionState {
  if (a.status === 'done') return a.doneAt && toMs(a.doneAt) > toMs(a.dueAt) ? 'done_late' : 'done';
  return now.getTime() > toMs(a.dueAt) ? 'overdue' : 'open';
}

export const isOverdue = (a: Action, now: Date) => actionState(a, now) === 'overdue';

/* ------------------------------------------------------------------ transitions (rule 2) */

export const statusIndex = (s: ReportStatus) => STATUSES.indexOf(s);

export const SERIOUS_NEEDS_ACTION = 'A serious report needs an action before it can move past triaged.';

/**
 * Can a report move to `to`? Returns the reason it cannot, or null.
 * new → triaged → action assigned → fixed → closed. Triaged can also go straight to fixed or closed when the
 * immediate action was enough, except for serious potential, which always needs an action (rule 2).
 */
export function checkTransition(r: Pick<Report, 'status' | 'potential'>, to: ReportStatus, actions: Pick<Action, 'status'>[]): string | null {
  const from = r.status;
  if (from === to) return `This report is already ${statusLabels[to].toLowerCase()}.`;
  if (from === 'closed') return 'This report is closed.';
  if (to === 'new') return 'A report cannot go back to new.';
  if (from === 'new' && to !== 'triaged' && to !== 'action_assigned') return 'Triage the report first.';
  if (statusIndex(to) < statusIndex(from)) return `A ${statusLabels[from].toLowerCase()} report cannot go back to ${statusLabels[to].toLowerCase()}.`;
  const past = statusIndex(to) > statusIndex('triaged');
  if (past && r.potential === 'serious' && actions.length === 0) return SERIOUS_NEEDS_ACTION;
  if (to === 'action_assigned' && actions.length === 0) return 'Assign an action first.';
  const open = actions.filter((a) => a.status === 'open').length;
  if ((to === 'fixed' || to === 'closed') && open > 0) return `Finish the open ${open === 1 ? 'action' : `${open} actions`} first.`;
  if (to === 'closed' && from === 'action_assigned') return 'Mark it fixed before closing it.';
  return null;
}

/** Statuses a report could move to next (for buttons), whether or not a rule currently allows them. */
export function nextStatuses(from: ReportStatus): ReportStatus[] {
  switch (from) {
    case 'new':
      return ['triaged'];
    case 'triaged':
      return ['fixed', 'closed'];
    case 'action_assigned':
      return ['fixed'];
    case 'fixed':
      return ['closed'];
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ editing (anonymity) */

export const ANONYMOUS_CANNOT_EDIT = 'Anonymous reports cannot be edited: nothing links them to you, by design.';

/** The reporter may edit their own named report while it is new. Returns the reason they cannot, or null. */
export function checkEdit(r: Pick<Report, 'anonymous' | 'reporterSub' | 'status'>, sub: string): string | null {
  if (r.anonymous || !r.reporterSub) return ANONYMOUS_CANNOT_EDIT;
  if (r.reporterSub !== sub) return 'Only the person who reported it can edit it.';
  if (r.status !== 'new') return 'A report can be edited only until it is triaged.';
  return null;
}
