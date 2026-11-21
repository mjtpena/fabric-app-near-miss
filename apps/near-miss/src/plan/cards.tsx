/**
 * Glass cards over the plan: the focused pin (what, where, how bad, status, triage clock, actions) and the focused
 * zone (hotspot rank, what people report there, what was fixed).
 */
import { MapPin, Presentation, X } from 'lucide-react';

import { DAY, formatRelative, toMs } from '@x10/shared/lib';
import { Button, FloatingPanel, IconButton, LinkButton, cx } from '@x10/shared/ui';

import { CategoryLabel, Dot, KindLabel, PotentialLabel, Reporter, StatusLabel, TONE_TEXT, triageText } from '../components/bits';
import { categoryLabels, potentialLabels, zoneKindLabels } from '../config';
import type { Hotspot } from '../domain/hotspots';
import { actionState } from '../domain/rules';
import { CATEGORIES, POTENTIALS, type Action, type Report, type ReportStatus, type Site, type Zone } from '../model';
import { POT_VAR } from './palette';

const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

export function PinCard({
  report,
  zone,
  site,
  actions,
  status,
  now,
  replay,
  canTriage,
  onClose,
  className,
}: {
  report: Report;
  zone: Zone | undefined;
  site: Site;
  actions: Action[];
  status: ReportStatus;
  now: Date;
  replay: boolean;
  canTriage: boolean;
  onClose: () => void;
  className?: string;
}) {
  const triage = status === 'new' && !replay ? triageText(report, now) : null;
  return (
    <FloatingPanel padding="none" className={cx('pointer-events-auto overflow-hidden', className)} data-testid="pin-card">
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted">
          <KindLabel kind={report.kind} className="font-medium text-fg" />
          <CategoryLabel category={report.category} />
        </div>
        <IconButton size="sm" label="Close" icon={<X />} onClick={onClose} className="-mr-1.5 -mt-1" />
      </div>
      <p className="m-0 line-clamp-4 px-4 pt-2 text-sm leading-5 text-fg">{report.description}</p>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 pt-3 text-ui">
        <dt className="text-muted">Potential</dt>
        <dd className="m-0">
          <PotentialLabel potential={report.potential} />
        </dd>
        <dt className="text-muted">Status</dt>
        <dd className="m-0 flex flex-wrap items-center gap-x-2">
          <StatusLabel status={status} />
          {replay && <span className="text-xs text-faint">on this day</span>}
        </dd>
        <dt className="text-muted">Where</dt>
        <dd className="m-0 truncate">
          {zone?.name ?? 'No zone'} <span className="text-faint">· {site.name}</span>
        </dd>
        <dt className="text-muted">Reported</dt>
        <dd className="m-0 flex flex-wrap gap-x-2">
          <span className="num">{formatRelative(report.reportedAt, now)}</span>
          <span className="text-faint">by</span>
          <Reporter report={report} />
        </dd>
      </dl>
      {triage && (
        <div className={cx('mx-4 mt-3 flex items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-ui', TONE_TEXT[triage.tone])} data-testid="triage-clock">
          <Dot color="currentColor" size={7} />
          <span className="num">Triage: {triage.text}</span>
        </div>
      )}
      {actions.length > 0 && (
        <ul className="m-0 mt-3 list-none divide-y divide-[var(--line)] border-t border-line p-0">
          {actions.map((a) => {
            const st = actionState(a, now);
            return (
              <li key={a.id} className="flex items-start gap-2.5 px-4 py-2 text-ui">
                <span className="pt-1.5">
                  <Dot color={st === 'overdue' ? 'var(--bad-solid)' : st.startsWith('done') ? 'var(--st-fixed)' : 'var(--st-action_assigned)'} size={7} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg">{a.title}</span>
                  <span className="text-xs text-muted">
                    {a.ownerName} ·{' '}
                    {st === 'overdue' ? (
                      <span className="text-bad-text num">{Math.ceil((now.getTime() - toMs(a.dueAt)) / DAY)}d overdue</span>
                    ) : st === 'open' ? (
                      <span className="num">due {shortDate.format(toMs(a.dueAt))}</span>
                    ) : (
                      <span className="num">done {shortDate.format(toMs(a.doneAt!))}{st === 'done_late' ? ', late' : ''}</span>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 mt-3">
        <LinkButton to={`/reports/${report.id}`} size="sm" variant={canTriage && status === 'new' ? 'secondary' : 'primary'}>
          Open report
        </LinkButton>
        {canTriage && status === 'new' && !replay && (
          <LinkButton to={`/reports/${report.id}?triage=1`} size="sm" variant="primary">
            Triage
          </LinkButton>
        )}
      </div>
    </FloatingPanel>
  );
}

export function ZoneCard({
  zone,
  site,
  reports,
  actions,
  hotspots,
  now,
  onClose,
  className,
}: {
  zone: Zone;
  site: Site;
  reports: Report[];
  actions: Action[];
  hotspots: Hotspot[];
  now: Date;
  onClose: () => void;
  className?: string;
}) {
  const idx = hotspots.findIndex((h) => h.zone.id === zone.id);
  const hs = idx >= 0 ? hotspots[idx] : null;
  const mine = reports.filter((r) => r.zoneId === zone.id && now.getTime() - toMs(r.reportedAt) < 90 * DAY);
  const open = mine.filter((r) => r.status !== 'fixed' && r.status !== 'closed').length;
  const cats = CATEGORIES.map((c) => ({ c, n: mine.filter((r) => r.category === c).length }))
    .filter((x) => x.n)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  const ids = new Set(mine.map((r) => r.id));
  const done = actions.filter((a) => ids.has(a.reportId) && a.status === 'done').length;
  const total = mine.length || 1;
  return (
    <FloatingPanel padding="none" className={cx('pointer-events-auto overflow-hidden', className)} data-testid="zone-card">
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
        <div className="min-w-0">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
            {zoneKindLabels[zone.kind]} · {site.name}
          </div>
          <div className="mt-0.5 text-base font-semibold leading-6">{zone.name}</div>
        </div>
        <IconButton size="sm" label="Close" icon={<X />} onClick={onClose} className="-mr-1.5 -mt-1" />
      </div>
      <div className="flex items-baseline gap-5 px-4 pt-2">
        <div>
          <div className={cx('text-2xl font-semibold leading-none tracking-[-0.03em] num', idx === 0 && 'text-bad-text')}>{hs ? `#${idx + 1}` : '–'}</div>
          <div className="mt-1 text-[11px] text-muted">hotspot, 90 days</div>
        </div>
        <div>
          <div className="text-2xl font-semibold leading-none tracking-[-0.03em] num">{hs?.score ?? 0}</div>
          <div className="mt-1 text-[11px] text-muted">heat score</div>
        </div>
        <div>
          <div className="text-2xl font-semibold leading-none tracking-[-0.03em] num">{mine.length}</div>
          <div className="mt-1 text-[11px] text-muted">{open} still open</div>
        </div>
      </div>
      {mine.length > 0 && (
        <div className="px-4 pt-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-gray-3" role="img" aria-label={POTENTIALS.map((p) => `${mine.filter((r) => r.potential === p).length} ${potentialLabels[p].toLowerCase()}`).join(', ')}>
            {[...POTENTIALS].reverse().map((p) => {
              const n = mine.filter((r) => r.potential === p).length;
              return n ? <span key={p} style={{ width: `${(n / total) * 100}%`, background: POT_VAR[p] }} /> : null;
            })}
          </div>
          <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-xs text-muted">
            {cats.map((x) => (
              <li key={x.c}>
                {categoryLabels[x.c]} <span className="font-mono text-fg num">{x.n}</span>
              </li>
            ))}
            {done > 0 && (
              <li>
                Fixes done <span className="font-mono text-fg num">{done}</span>
              </li>
            )}
          </ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3">
        <LinkButton to={`/toolbox?zone=${zone.id}`} size="sm" icon={<Presentation />}>
          Toolbox talk
        </LinkButton>
        <LinkButton to={`/report?site=${site.id}&zone=${zone.id}`} size="sm" variant="primary" icon={<MapPin />}>
          Report here
        </LinkButton>
      </div>
    </FloatingPanel>
  );
}

export function ReplayBanner({ onLive }: { onLive: () => void }) {
  return (
    <Button size="sm" onClick={onLive} className="x-glass rounded-full! ring-0">
      Back to today
    </Button>
  );
}
