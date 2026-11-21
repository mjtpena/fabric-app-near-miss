/**
 * Pure hotspot maths (rule 4) and the time-slider replay: ranking zones by a weighted count of reports, live heat that
 * forms and cools, and each report's status as it was on a given day.
 */
import { DAY, toMs } from '@x10/shared/lib';

import { FIXED_HEAT_FACTOR, HEAT_HALF_LIFE_DAYS, HOTSPOT_WEIGHTS, HOTSPOT_WINDOW_DAYS } from '../config';
import type { Action, Potential, Report, ReportStatus, Zone } from '../model';

export const weightOf = (p: Potential) => HOTSPOT_WEIGHTS[p];

/** Reported within the last `days` days up to `now`: (now − days, now]. */
export function inWindow(iso: string, now: Date, days: number): boolean {
  const t = toMs(iso);
  return t <= now.getTime() && t > now.getTime() - days * DAY;
}

export interface Hotspot {
  zone: Zone;
  score: number;
  count: number;
  byPotential: Record<Potential, number>;
}

/**
 * Zones ranked by the weighted count of their reports over the window (serious 8, high 4, medium 2, low 1).
 * Reports without a zone, or in a zone not in `zones`, are ignored. Ties: more reports first, then name.
 */
export function rankHotspots(reports: Report[], zones: Zone[], now: Date, days = HOTSPOT_WINDOW_DAYS): Hotspot[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const acc = new Map<string, Hotspot>();
  for (const r of reports) {
    if (!r.zoneId || !inWindow(r.reportedAt, now, days)) continue;
    const zone = byId.get(r.zoneId);
    if (!zone) continue;
    const h = acc.get(zone.id) ?? { zone, score: 0, count: 0, byPotential: { low: 0, medium: 0, high: 0, serious: 0 } };
    h.score += weightOf(r.potential);
    h.count += 1;
    h.byPotential[r.potential] += 1;
    acc.set(zone.id, h);
  }
  return [...acc.values()].sort((a, b) => b.score - a.score || b.count - a.count || a.zone.name.localeCompare(b.zone.name));
}

/* ------------------------------------------------------------------ live heat */

/** One report's heat at time t: its weight, halving every half-life, cut to the fixed factor once fixed. */
export function heatOf(r: Pick<Report, 'reportedAt' | 'potential' | 'fixedAt'>, t: number): number {
  const at = toMs(r.reportedAt);
  if (at > t) return 0;
  const ageDays = (t - at) / DAY;
  const fixed = r.fixedAt !== null && toMs(r.fixedAt) <= t;
  return weightOf(r.potential) * 0.5 ** (ageDays / HEAT_HALF_LIFE_DAYS) * (fixed ? FIXED_HEAT_FACTOR : 1);
}

/** Heat per zone at time t (zones with no heat are absent). */
export function zoneHeat(reports: Report[], t: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of reports) {
    if (!r.zoneId) continue;
    const h = heatOf(r, t);
    if (h > 0) m.set(r.zoneId, (m.get(r.zoneId) ?? 0) + h);
  }
  return m;
}

/** A zone's heat sampled every `stepDays` from `from` to `to` (inclusive). */
export function heatSeries(reports: Report[], zoneId: string, from: number, to: number, stepDays = 1): { t: number; heat: number }[] {
  const mine = reports.filter((r) => r.zoneId === zoneId);
  const out: { t: number; heat: number }[] = [];
  for (let t = from; t <= to + 1; t += stepDays * DAY) {
    const at = Math.min(t, to);
    out.push({ t: at, heat: mine.reduce((s, r) => s + heatOf(r, at), 0) });
  }
  return out;
}

/** The hottest any zone got between `from` and `to` (sampled daily), to scale the heat layer consistently. */
export function peakHeat(reports: Report[], from: number, to: number): number {
  let peak = 0;
  for (let t = from; t <= to + 1; t += DAY) {
    for (const h of zoneHeat(reports, Math.min(t, to)).values()) peak = Math.max(peak, h);
  }
  return peak;
}

/** How much a zone has cooled from its peak in [from, to] to `to`, 0–1 (1 = completely cold). */
export function coolingSincePeak(series: { t: number; heat: number }[]): { peak: number; peakAt: number; now: number; drop: number } {
  let peak = 0;
  let peakAt = series[0]?.t ?? 0;
  for (const p of series) {
    if (p.heat > peak) {
      peak = p.heat;
      peakAt = p.t;
    }
  }
  const now = series[series.length - 1]?.heat ?? 0;
  return { peak, peakAt, now, drop: peak > 0 ? 1 - now / peak : 0 };
}

/* ------------------------------------------------------------------ replay */

/**
 * The report's status as it was at time t, for the time slider (null: not reported yet). Reconstructed from the
 * timestamps: new until triaged, action assigned once its first action existed, fixed from fixedAt, closed from closedAt.
 */
export function statusAt(r: Report, actions: Pick<Action, 'reportId' | 'createdAt'>[], t: number): ReportStatus | null {
  if (toMs(r.reportedAt) > t) return null;
  if (r.closedAt && toMs(r.closedAt) <= t) return 'closed';
  if (r.fixedAt && toMs(r.fixedAt) <= t) return 'fixed';
  const hasAction = actions.some((a) => a.reportId === r.id && toMs(a.createdAt) <= t);
  if (hasAction) return 'action_assigned';
  if (r.triagedAt && toMs(r.triagedAt) <= t) return 'triaged';
  if (r.status !== 'new' && !r.triagedAt) return r.status; // legacy rows without timestamps
  return 'new';
}
