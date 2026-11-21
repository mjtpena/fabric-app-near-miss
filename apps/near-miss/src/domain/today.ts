/**
 * Today: the three to five things that need attention now, ranked, for the chosen view-as role. Pure, so the
 * ranking is unit-tested. Each pick says what the plan should focus (a pin, a zone, or a heat replay) and which lens
 * explains it.
 */
import { DAY, HOUR, toMs } from '@x10/shared/lib';

import { HOT_MONTH_DAYS, potentialLabels, kindLabels, THANK_DAYS, URGENT_POTENTIALS } from '../config';
import type { Action, Report, Site, Zone } from '../model';
import { coolingSincePeak, heatSeries, rankHotspots } from './hotspots';
import { canTriage, supervises, type Role } from './reports';
import { actionState, triageClock } from './rules';

export type LensKey = 'potential' | 'status' | 'category' | 'age' | 'heat';

export type Focus =
  | { kind: 'report'; id: string; siteId: string }
  | { kind: 'zone'; id: string; siteId: string }
  | { kind: 'replay'; id: string; siteId: string; at: number };

export interface TodayPick {
  id: string;
  title: string;
  tone: 'bad' | 'warn' | 'ok' | 'info';
  value: string;
  unit: string;
  lens: LensKey;
  meta: string;
  focus: Focus;
}

export interface TodayInput {
  sites: Site[];
  zones: Zone[];
  reports: Report[];
  actions: Action[];
}

const TONE_RANK = { bad: 0, warn: 1, info: 2, ok: 3 } as const;

function hours(ms: number): string {
  const h = Math.abs(ms) / HOUR;
  return h >= 48 ? `${Math.round(h / 24)}d` : `${Math.max(1, Math.round(h))}h`;
}

/** Sites whose reports this role is responsible for. */
export function scopeSites(sites: Site[], me: { sub: string; isAdmin: boolean | null }, role: Role, currentSiteId: string | null): Site[] {
  if (role === 'lead') return sites;
  if (role === 'supervisor') {
    const mine = sites.filter((s) => supervises(me, s) || (me.isAdmin === true && canTriage(me, s)));
    return mine.length ? mine : sites.filter((s) => s.id === currentSiteId);
  }
  return sites.filter((s) => s.id === currentSiteId);
}

export function rankToday(
  data: TodayInput,
  me: { sub: string; isAdmin: boolean | null },
  role: Role,
  currentSiteId: string | null,
  now: Date,
): TodayPick[] {
  const scope = new Set(scopeSites(data.sites, me, role, currentSiteId).map((s) => s.id));
  const zoneName = (id: string | null) => data.zones.find((z) => z.id === id)?.name ?? 'an unzoned spot';
  const siteName = (id: string) => data.sites.find((s) => s.id === id)?.name ?? '';
  /** "Northgate" for "Northgate Distribution Centre": enough to tell three sites apart in a short title. */
  const shortSite = (id: string) => siteName(id).split(' ')[0];
  const multi = scope.size > 1;
  const where = (r: Report) => (multi ? `${zoneName(r.zoneId)}, ${shortSite(r.siteId)}` : zoneName(r.zoneId));
  const reports = data.reports.filter((r) => scope.has(r.siteId) && toMs(r.reportedAt) <= now.getTime());
  const picks: TodayPick[] = [];

  if (role === 'reporter') {
    const mine = data.reports.filter((r) => r.reporterSub === me.sub);
    const fixed = mine
      .filter((r) => r.fixedAt && now.getTime() - toMs(r.fixedAt) <= THANK_DAYS * DAY)
      .sort((a, b) => toMs(b.fixedAt!) - toMs(a.fixedAt!));
    if (fixed[0]) {
      picks.push({
        id: `mine-fixed-${fixed[0].id}`,
        title: `Your report at ${zoneName(fixed[0].zoneId)} was fixed`,
        tone: 'ok',
        value: String(fixed.length),
        unit: fixed.length === 1 ? 'fixed' : 'fixed lately',
        lens: 'status',
        meta: `${kindLabels[fixed[0].kind]} · thank you`,
        focus: { kind: 'report', id: fixed[0].id, siteId: fixed[0].siteId },
      });
    }
    const open = mine.filter((r) => r.status !== 'fixed' && r.status !== 'closed');
    if (open.length) {
      const oldest = [...open].sort((a, b) => toMs(a.reportedAt) - toMs(b.reportedAt))[0];
      picks.push({
        id: 'mine-open',
        title: open.length === 1 ? `Your report at ${zoneName(oldest.zoneId)} is being handled` : `${open.length} of your reports are being handled`,
        tone: 'info',
        value: String(open.length),
        unit: 'open',
        lens: 'status',
        meta: `Oldest: ${zoneName(oldest.zoneId)}`,
        focus: { kind: 'report', id: oldest.id, siteId: oldest.siteId },
      });
    }
  }

  if (role !== 'reporter') {
    // 1. High and serious potential waiting for triage (4 h clock), most overdue first.
    const urgent = reports
      .filter((r) => r.status === 'new' && URGENT_POTENTIALS.includes(r.potential))
      .map((r) => ({ r, c: triageClock(r, now) }))
      .sort((a, b) => a.c.marginMs - b.c.marginMs || (a.r.potential === 'serious' ? -1 : 1));
    if (urgent[0]) {
      const { r, c } = urgent[0];
      const late = c.state === 'late';
      picks.push({
        id: `urgent-${r.id}`,
        title: `${potentialLabels[r.potential]} ${kindLabels[r.kind].toLowerCase()} ${late ? 'untriaged' : 'to triage'} at ${where(r)}`,
        tone: late || r.potential === 'serious' ? 'bad' : 'warn',
        value: hours(c.marginMs),
        unit: late ? 'past the 4 h limit' : 'left to triage',
        lens: 'status',
        meta: urgent.length > 1 ? `+${urgent.length - 1} more high or serious` : `${potentialLabels[r.potential]} potential`,
        focus: { kind: 'report', id: r.id, siteId: r.siteId },
      });
    }
    // 2. Other reports past the 24 h triage limit.
    const late = reports
      .filter((r) => r.status === 'new' && !URGENT_POTENTIALS.includes(r.potential) && triageClock(r, now).state === 'late')
      .sort((a, b) => toMs(a.reportedAt) - toMs(b.reportedAt));
    if (late.length) {
      picks.push({
        id: 'late-triage',
        title: late.length === 1 ? `A report at ${where(late[0])} is waiting past 24 h` : `${late.length} reports waiting past 24 h`,
        tone: 'warn',
        value: String(late.length),
        unit: 'late triage',
        lens: 'status',
        meta: `Oldest: ${where(late[0])}`,
        focus: { kind: 'report', id: late[0].id, siteId: late[0].siteId },
      });
    }
    // 3. Overdue actions.
    const overdue = data.actions
      .filter((a) => scope.has(a.siteId) && actionState(a, now) === 'overdue')
      .sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt));
    if (overdue.length) {
      const first = overdue[0];
      const rep = data.reports.find((r) => r.id === first.reportId);
      picks.push({
        id: 'overdue-actions',
        title: overdue.length === 1 ? `An action is overdue: ${first.title}` : `${overdue.length} actions overdue`,
        tone: 'bad',
        value: String(overdue.length),
        unit: 'overdue',
        lens: 'status',
        meta: `Oldest: ${first.ownerName}, ${Math.ceil((now.getTime() - toMs(first.dueAt)) / DAY)}d late`,
        focus: rep ? { kind: 'report', id: rep.id, siteId: rep.siteId } : { kind: 'zone', id: '', siteId: first.siteId },
      });
    }
  }

  // 4. The hottest zone this month.
  const hot = rankHotspots(reports, data.zones, now, HOT_MONTH_DAYS)[0];
  if (hot) {
    picks.push({
      id: `hot-${hot.zone.id}`,
      title: `${hot.zone.name} is the hottest zone this month`,
      tone: 'warn',
      value: String(hot.score),
      unit: 'heat score',
      lens: 'heat',
      meta: `${hot.count} reports${multi ? ` · ${siteName(hot.zone.siteId)}` : ''}`,
      focus: { kind: 'zone', id: hot.zone.id, siteId: hot.zone.siteId },
    });
  }

  // 5. A hotspot that cooled after its fix (safety lead and supervisors): replay it.
  if (role !== 'reporter') {
    const from = now.getTime() - 90 * DAY;
    const cooled = rankHotspots(reports, data.zones, now, 90)
      .slice(0, 3)
      .map((h) => ({ h, c: coolingSincePeak(heatSeries(reports, h.zone.id, from, now.getTime(), 1)) }))
      .filter(({ c }) => c.drop >= 0.6 && c.peak >= 10)
      .sort((a, b) => b.c.peak - a.c.peak)[0];
    if (cooled) {
      picks.push({
        id: `cooled-${cooled.h.zone.id}`,
        title: `${cooled.h.zone.name} cooled after its fix`,
        tone: 'ok',
        value: `−${Math.round(cooled.c.drop * 100)}%`,
        unit: 'heat since peak',
        lens: 'heat',
        meta: 'Replay the last 90 days',
        focus: { kind: 'replay', id: cooled.h.zone.id, siteId: cooled.h.zone.siteId, at: cooled.c.peakAt },
      });
    }
  }

  // 6. Good catches to thank.
  const catches = reports.filter((r) => r.kind === 'good_catch' && now.getTime() - toMs(r.reportedAt) <= THANK_DAYS * DAY);
  if (catches.length) {
    const named = catches.filter((r) => !r.anonymous && r.reporterName).map((r) => r.reporterName!);
    const anon = catches.length - named.length;
    picks.push({
      id: 'good-catches',
      title: catches.length === 1 ? `A good catch at ${where(catches[0])} to thank` : `${catches.length} good catches to thank`,
      tone: 'ok',
      value: String(catches.length),
      unit: `in ${THANK_DAYS} days`,
      lens: 'potential',
      meta: [...new Set(named)].slice(0, 2).join(', ') + (anon ? `${named.length ? ' + ' : ''}${anon} anonymous` : ''),
      focus: { kind: 'report', id: catches[0].id, siteId: catches[0].siteId },
    });
  }

  return picks
    .map((p, i) => ({ p, i }))
    .sort((a, b) => TONE_RANK[a.p.tone] - TONE_RANK[b.p.tone] || a.i - b.i)
    .map(({ p }) => p)
    .slice(0, 5);
}
