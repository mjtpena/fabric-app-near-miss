/**
 * Fix list: every action by owner (or by due date), overdue first. Owners mark their own actions done with a note of
 * what was done; the last action on a report marks the report fixed.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ListChecks } from 'lucide-react';

import { useApp } from '@x10/shared/runtime';
import { DAY, toMs, useAsync, usePolling } from '@x10/shared/lib';
import { Avatar, Button, DataState, EmptyState, FilterSelect, LoadingBlock, PageHeader, SegmentedControl, Stat, StatStrip, Toolbar, cx } from '@x10/shared/ui';

import { Dot, PotentialLabel } from '../components/bits';
import { fixedOnTimeRate } from '../domain/indicators';
import { loadAll, type PlanData } from '../domain/reports';
import { actionState, type ActionState } from '../domain/rules';
import type { Action, Schema } from '../model';
import { DoneDialog } from './ReportDetailPage';

const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

export function FixListPage() {
  const { store } = useApp<Schema>();
  const data = useAsync(() => loadAll(store), [store]);
  usePolling(data.reload, 5000);
  return (
    <>
      <PageHeader title="Fix list" />
      <DataState state={data} skeleton={<LoadingBlock rows={8} />}>
        {(d) => <Fixes data={d} reload={data.reload} />}
      </DataState>
    </>
  );
}

type Scope = 'mine' | 'all';
type Group = 'owner' | 'due';

function Fixes({ data, reload }: { data: PlanData; reload: () => Promise<void> }) {
  const { me } = useApp<Schema>();
  const now = useMemo(() => new Date(), [data]);
  const mineOpen = data.actions.some((a) => a.ownerSub === me.sub && a.status === 'open');
  const [scope, setScope] = useState<Scope>(mineOpen ? 'mine' : 'all');
  const [site, setSite] = useState('all');
  const [group, setGroup] = useState<Group>('owner');
  const [showDone, setShowDone] = useState(false);
  const [doing, setDoing] = useState<Action | null>(null);

  const inScope = data.actions.filter((a) => (scope === 'all' || a.ownerSub === me.sub) && (site === 'all' || a.siteId === site));
  const open = inScope.filter((a) => a.status === 'open').sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt));
  const overdue = open.filter((a) => actionState(a, now) === 'overdue');
  const week = open.filter((a) => actionState(a, now) === 'open' && toMs(a.dueAt) - now.getTime() <= 7 * DAY);
  const done = inScope.filter((a) => a.status === 'done' && a.doneAt && now.getTime() - toMs(a.doneAt) <= 30 * DAY).sort((a, b) => toMs(b.doneAt!) - toMs(a.doneAt!));
  const rate = fixedOnTimeRate(inScope.filter((a) => now.getTime() - toMs(a.dueAt) <= 90 * DAY), now);

  const groups: { key: string; title: ReactNode; meta: string; items: Action[] }[] =
    group === 'owner'
      ? [...new Set(open.map((a) => a.ownerSub))]
          .map((sub) => {
            const items = open.filter((a) => a.ownerSub === sub);
            const od = items.filter((a) => actionState(a, now) === 'overdue').length;
            return {
              key: sub,
              title: (
                <span className="inline-flex items-center gap-2">
                  <Avatar name={items[0].ownerName} size="sm" />
                  {items[0].ownerName}
                  {sub === me.sub && <span className="text-xs font-normal text-muted">(you)</span>}
                </span>
              ),
              meta: `${items.length} open${od ? ` · ${od} overdue` : ''}`,
              items,
              od,
            };
          })
          .sort((a, b) => b.od - a.od || b.items.length - a.items.length)
      : [
          { key: 'overdue', title: 'Overdue', meta: '', items: overdue },
          { key: 'week', title: 'Due in the next 7 days', meta: '', items: week },
          { key: 'later', title: 'Later', meta: '', items: open.filter((a) => !overdue.includes(a) && !week.includes(a)) },
        ].filter((g) => g.items.length);

  return (
    <>
      <StatStrip className="mb-6">
        <Stat label="Open" value={<span className="num">{open.length}</span>} />
        <Stat label="Overdue" value={<span className="num">{overdue.length}</span>} tone={overdue.length ? 'bad' : undefined} />
        <Stat label="Due in 7 days" value={<span className="num">{week.length}</span>} />
        <Stat label="Fixed on time, 90 days" value={<span className="num">{rate === null ? '–' : `${Math.round(rate * 100)}%`}</span>} />
      </StatStrip>
      <Toolbar className="mb-5">
        <SegmentedControl<Scope>
          label="Whose actions"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'mine', label: 'Mine' },
            { value: 'all', label: 'Everyone' },
          ]}
        />
        <FilterSelect label="Site" value={site} onChange={setSite} options={[{ value: 'all', label: 'All sites' }, ...data.sites.map((s) => ({ value: s.id, label: s.name }))]} />
        <SegmentedControl<Group>
          label="Group by"
          value={group}
          onChange={setGroup}
          className="ml-auto"
          options={[
            { value: 'owner', label: 'By owner' },
            { value: 'due', label: 'By due date' },
          ]}
        />
      </Toolbar>

      {open.length === 0 ? (
        <EmptyState icon={<ListChecks />} title={scope === 'mine' ? 'Nothing on your list' : 'No open actions'} bordered>
          {scope === 'mine' ? 'Fixes assigned to you show here.' : 'Every fix is done. Supervisors assign new ones from a report.'}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={typeof g.title === 'string' ? g.title : undefined} data-testid="fix-group">
              <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                <h2 className="m-0 text-sm font-semibold">{g.title}</h2>
                <span className="text-xs text-muted num">{g.meta || `${g.items.length}`}</span>
              </div>
              <ul className="m-0 list-none divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line bg-surface p-0">
                {g.items.map((a) => (
                  <Row key={a.id} action={a} data={data} now={now} showOwner={group === 'due'} onDone={setDoing} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section className="mt-8">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="flex cursor-pointer items-center gap-1.5 px-1 text-sm font-semibold" aria-expanded={showDone}>
            <ChevronDown className={cx('size-4 transition-transform', !showDone && '-rotate-90')} aria-hidden="true" />
            Done in the last 30 days <span className="font-normal text-muted num">{done.length}</span>
          </button>
          {showDone && (
            <ul className="m-0 mt-2 list-none divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line bg-surface p-0">
              {done.map((a) => (
                <Row key={a.id} action={a} data={data} now={now} showOwner onDone={setDoing} />
              ))}
            </ul>
          )}
        </section>
      )}
      {doing && <DoneDialog action={doing} onClose={() => setDoing(null)} reload={reload} />}
    </>
  );
}

const STATE_COLOR: Record<ActionState, string> = {
  open: 'var(--st-action_assigned)',
  overdue: 'var(--bad-solid)',
  done: 'var(--st-fixed)',
  done_late: 'var(--st-fixed)',
};

function Row({ action: a, data, now, showOwner, onDone }: { action: Action; data: PlanData; now: Date; showOwner: boolean; onDone: (a: Action) => void }) {
  const { me } = useApp<Schema>();
  const r = data.reports.find((x) => x.id === a.reportId);
  const zone = data.zones.find((z) => z.id === r?.zoneId);
  const site = data.sites.find((s) => s.id === a.siteId);
  const st = actionState(a, now);
  const days = Math.ceil((toMs(a.dueAt) - now.getTime()) / DAY);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3" data-testid="fix-row" data-state={st}>
      <span className="pt-1.5">
        <Dot color={STATE_COLOR[st]} />
      </span>
      <div className="min-w-0">
        <Link to={r ? `/reports/${r.id}` : '/'} className="block text-sm font-medium leading-5 text-fg hover:underline">
          {a.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <span>
            {zone?.name ?? 'No zone'} · {site?.name}
          </span>
          {r && <PotentialLabel potential={r.potential} className="text-xs" />}
          {showOwner && <span>{a.ownerName}</span>}
        </div>
        {a.verification && st.startsWith('done') && <div className="mt-1 text-ui text-muted">{a.verification}</div>}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className={cx('whitespace-nowrap font-mono text-xs num', st === 'overdue' ? 'text-bad-text' : 'text-muted')}>
          {st === 'overdue'
            ? `${-days}d overdue`
            : st === 'open'
              ? days <= 0
                ? 'due today'
                : `due ${shortDate.format(toMs(a.dueAt))}`
              : `done ${shortDate.format(toMs(a.doneAt!))}${st === 'done_late' ? ' · late' : ''}`}
        </span>
        {a.status === 'open' && a.ownerSub === me.sub && (
          <Button size="sm" onClick={() => onDone(a)}>
            Mark done
          </Button>
        )}
      </div>
    </li>
  );
}
