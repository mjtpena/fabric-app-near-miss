/**
 * Leading indicators (rule 5): reports per month, % of actions fixed within their due date, median days to fix,
 * and good catches. Pure, so the Lead indicators page and the tests share them.
 */
import { DAY, median, toMs } from '@x10/shared/lib';

import type { Action, Report, ReportKind } from '../model';
import { KINDS } from '../model';

/** UTC calendar month key, "2026-11". */
export function monthKey(iso: string | number): string {
  const d = new Date(typeof iso === 'number' ? iso : toMs(iso));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The last `n` month keys up to and including the month of `now`, oldest first. */
export function lastMonths(now: Date, n: number): string[] {
  const out: string[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    out.push(monthKey(d.getTime()));
  }
  return out;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/**
 * Share of actions fixed within their due date, among actions whose outcome is known by `now`: done (on time or
 * late) or still open past the due date. Open actions not yet due are not counted. Null when nothing is known yet.
 */
export function fixedOnTimeRate(actions: Action[], now: Date): number | null {
  let onTime = 0;
  let known = 0;
  for (const a of actions) {
    if (a.status === 'done' && a.doneAt) {
      known += 1;
      if (toMs(a.doneAt) <= toMs(a.dueAt)) onTime += 1;
    } else if (now.getTime() > toMs(a.dueAt)) {
      known += 1;
    }
  }
  return known ? onTime / known : null;
}

/** Days from report to fix, for fixed reports. */
export function daysToFix(r: Report): number | null {
  if (!r.fixedAt) return null;
  return Math.max(0, (toMs(r.fixedAt) - toMs(r.reportedAt)) / DAY);
}

export function medianDaysToFix(reports: Report[]): number | null {
  return median(reports.map(daysToFix).filter((d): d is number => d !== null));
}

export const goodCatches = (reports: Report[]) => reports.filter((r) => r.kind === 'good_catch').length;

export interface MonthRow {
  month: string;
  label: string;
  total: number;
  byKind: Record<ReportKind, number>;
  goodCatches: number;
  /** Actions due this month: share done by the due date (null when none are known yet). */
  onTimeRate: number | null;
  /** Reports fixed this month: median days to fix. */
  medianDays: number | null;
}

/** Monthly series for the charts: reports by kind, good catches, on-time rate (by due month), median days (by fix month). */
export function monthlyIndicators(reports: Report[], actions: Action[], now: Date, months = 4): MonthRow[] {
  return lastMonths(now, months).map((month) => {
    const rs = reports.filter((r) => monthKey(r.reportedAt) === month && toMs(r.reportedAt) <= now.getTime());
    const byKind = Object.fromEntries(KINDS.map((k) => [k, rs.filter((r) => r.kind === k).length])) as Record<ReportKind, number>;
    const due = actions.filter((a) => monthKey(a.dueAt) === month);
    const fixed = reports.filter((r) => r.fixedAt && monthKey(r.fixedAt) === month);
    return {
      month,
      label: monthLabel(month),
      total: rs.length,
      byKind,
      goodCatches: byKind.good_catch,
      onTimeRate: fixedOnTimeRate(due, now),
      medianDays: medianDaysToFix(fixed),
    };
  });
}

export interface IndicatorSummary {
  reports: number;
  goodCatches: number;
  onTimeRate: number | null;
  medianDays: number | null;
}

/** The four indicators over the last `days` days (reports by report date, actions by due date, fixes by fix date). */
export function summarise(reports: Report[], actions: Action[], now: Date, days: number): IndicatorSummary {
  const from = now.getTime() - days * DAY;
  const inRange = (iso: string | null) => iso !== null && toMs(iso) > from && toMs(iso) <= now.getTime();
  const rs = reports.filter((r) => inRange(r.reportedAt));
  return {
    reports: rs.length,
    goodCatches: goodCatches(rs),
    onTimeRate: fixedOnTimeRate(actions.filter((a) => inRange(a.dueAt)), now),
    medianDays: medianDaysToFix(reports.filter((r) => inRange(r.fixedAt))),
  };
}
