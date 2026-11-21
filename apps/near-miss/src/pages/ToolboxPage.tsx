/**
 * Toolbox talk: a printable one-page briefing on one zone for the start of a shift: where it is, what people
 * reported there in 90 days (never who), what was fixed, what is still open, and what to talk about.
 */
import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Presentation, Printer } from 'lucide-react';

import { useApp } from '@x10/shared/runtime';
import { DAY, toMs, useAsync } from '@x10/shared/lib';
import { Button, DataState, EmptyState, FilterSelect, LoadingBlock, PageHeader, Toolbar } from '@x10/shared/ui';

import { CategoryIcon, Dot, KindLabel } from '../components/bits';
import { categoryLabels, potentialLabels, talkingPoints, zoneKindLabels } from '../config';
import { rankHotspots } from '../domain/hotspots';
import { loadAll, type PlanData } from '../domain/reports';
import { actionState } from '../domain/rules';
import { CATEGORIES, POTENTIALS, type Schema } from '../model';
import { MiniPlan } from '../plan/MiniPlan';
import { POT_VAR } from '../plan/palette';

const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

export function ToolboxPage() {
  const { store } = useApp<Schema>();
  const data = useAsync(() => loadAll(store), [store]);
  return (
    <DataState
      state={data}
      isEmpty={(d) => d.zones.length === 0}
      empty={<EmptyState icon={<Presentation />} title="No zones to brief on yet">Sites and their zones come first.</EmptyState>}
      skeleton={<LoadingBlock rows={10} />}
    >
      {(d) => <Talk data={d} />}
    </DataState>
  );
}

function Talk({ data }: { data: PlanData }) {
  const [params, setParams] = useSearchParams();
  const now = useMemo(() => new Date(), [data]);
  const top = useMemo(() => rankHotspots(data.reports, data.zones, now)[0]?.zone ?? data.zones[0], [data, now]);
  const zone = data.zones.find((z) => z.id === params.get('zone')) ?? top;
  const site = data.sites.find((s) => s.id === zone.siteId)!;
  const siteZones = data.zones.filter((z) => z.siteId === site.id);
  const setZone = (id: string) => setParams({ zone: id }, { replace: true });

  const reports = data.reports.filter((r) => r.zoneId === zone.id && now.getTime() - toMs(r.reportedAt) <= 90 * DAY).sort((a, b) => toMs(b.reportedAt) - toMs(a.reportedAt));
  const ids = new Set(reports.map((r) => r.id));
  const actions = data.actions.filter((a) => ids.has(a.reportId));
  const fixed = actions.filter((a) => a.status === 'done').sort((a, b) => toMs(b.doneAt!) - toMs(a.doneAt!));
  const open = actions.filter((a) => a.status === 'open').sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt));
  const cats = CATEGORIES.map((c) => ({ c, n: reports.filter((r) => r.category === c).length }))
    .filter((x) => x.n)
    .sort((a, b) => b.n - a.n);
  const hot = rankHotspots(data.reports, siteZones, now);
  const rank = hot.findIndex((h) => h.zone.id === zone.id);
  const points = cats.slice(0, 2).flatMap((x) => talkingPoints[x.c]);
  const goodCatches = reports.filter((r) => r.kind === 'good_catch').length;

  return (
    <>
      <div className="x-noprint">
        <PageHeader
          title="Toolbox talk"
          actions={
            <Button variant="primary" icon={<Printer />} onClick={() => window.print()}>
              Print
            </Button>
          }
        />
        <Toolbar className="mb-6">
          <FilterSelect
            label="Site"
            value={site.id}
            onChange={(id) => setZone((rankHotspots(data.reports, data.zones.filter((z) => z.siteId === id), now)[0]?.zone ?? data.zones.find((z) => z.siteId === id)!).id)}
            options={data.sites.map((s) => ({ value: s.id, label: s.name }))}
          />
          <FilterSelect
            label="Zone"
            value={zone.id}
            onChange={setZone}
            options={[...siteZones].sort((a, b) => a.name.localeCompare(b.name)).map((z) => ({ value: z.id, label: z.name }))}
          />
        </Toolbar>
      </div>

      {/* The sheet: one A4 page. */}
      <article className="mx-auto max-w-[820px] rounded-xl border border-line bg-surface px-5 py-6 shadow-xs sm:px-10 sm:py-9 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none" data-testid="toolbox-sheet">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[var(--gray-12)] pb-4">
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Toolbox talk · {site.name}</div>
            <h2 className="m-0 mt-1 text-3xl font-semibold tracking-[-0.025em]" data-testid="toolbox-zone">
              {zone.name}
            </h2>
            <div className="mt-1 text-ui text-muted">
              {zoneKindLabels[zone.kind]} · last 90 days · {longDate.format(now)}
            </div>
          </div>
          <dl className="m-0 grid grid-cols-3 gap-x-6 text-right">
            <Fig label="reports" value={reports.length} />
            <Fig label="fixes done" value={fixed.length} />
            <Fig label={rank >= 0 ? 'hotspot rank' : 'not a hotspot'} value={rank >= 0 ? `#${rank + 1}` : '–'} bad={rank === 0} />
          </dl>
        </header>

        <div className="mt-5 grid gap-6 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <MiniPlan
              zones={siteZones}
              siteKind={site.kind}
              crop={zone}
              highlightZoneId={zone.id}
              pins={reports
                .filter((r) => r.x !== null)
                .map((r) => ({ id: r.id, x: r.x!, y: r.y!, color: POT_VAR[r.potential], kind: r.kind, fixed: r.status === 'fixed' || r.status === 'closed' }))}
              label={`${zone.name} on the plan of ${site.name}, with its reports`}
              className="overflow-hidden rounded-lg border border-line"
            />
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              {[...POTENTIALS].reverse().map((p) => {
                const n = reports.filter((r) => r.potential === p).length;
                return n ? (
                  <span key={p} className="inline-flex items-center gap-1.5">
                    <Dot color={POT_VAR[p]} size={7} />
                    {potentialLabels[p]} <span className="font-mono text-fg num">{n}</span>
                  </span>
                ) : null;
              })}
            </div>
          </div>
          <section className="min-w-0">
            <H>Talk about</H>
            {points.length ? (
              <ol className="m-0 list-none space-y-2.5 p-0">
                {points.map((p, i) => (
                  <li key={i} className="grid grid-cols-[22px_1fr] gap-2 text-sm leading-5">
                    <span className="font-mono text-xs leading-5 text-muted num">{String(i + 1).padStart(2, '0')}</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="m-0 text-sm text-muted">Nothing reported here in 90 days. Ask the team what they have noticed.</p>
            )}
            {goodCatches > 0 && (
              <p className="m-0 mt-4 text-sm">
                <span className="font-medium">Thank the team:</span> {goodCatches} good catch{goodCatches === 1 ? '' : 'es'} here.
              </p>
            )}
          </section>
        </div>

        <section className="mt-7 nm-avoid-break">
          <H>What people reported</H>
          {cats.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {cats.map((x) => (
                <span key={x.c} className="inline-flex items-center gap-1.5 text-ui">
                  <CategoryIcon category={x.c} className="text-muted [&_svg]:size-3.5" />
                  {categoryLabels[x.c]} <span className="font-mono text-muted num">{x.n}</span>
                </span>
              ))}
            </div>
          )}
          <ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
            {reports.slice(0, 6).map((r) => (
              <li key={r.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-2 text-sm leading-5">
                <span className="font-mono text-xs leading-5 text-muted num">{shortDate.format(toMs(r.reportedAt))}</span>
                <span>
                  {r.description}{' '}
                  <span className="whitespace-nowrap text-xs text-muted">
                    <KindLabel kind={r.kind} className="text-xs" /> · {potentialLabels[r.potential]}
                  </span>
                </span>
              </li>
            ))}
            {reports.length > 6 && <li className="py-2 text-xs text-muted">and {reports.length - 6} more on the site plan</li>}
          </ul>
          <p className="m-0 mt-2 text-xs text-faint">Reporters are never named on a toolbox talk.</p>
        </section>

        <div className="mt-7 grid gap-6 sm:grid-cols-2">
          <section className="nm-avoid-break">
            <H>What we fixed</H>
            {fixed.length ? (
              <ul className="m-0 list-none space-y-2.5 p-0">
                {fixed.slice(0, 5).map((a) => (
                  <li key={a.id} className="text-sm leading-5">
                    <span className="font-medium">{a.title}</span>
                    <span className="ml-1.5 font-mono text-xs text-muted num">{shortDate.format(toMs(a.doneAt!))}</span>
                    {a.verification && <span className="block text-ui text-muted">{a.verification}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm text-muted">No fixes recorded here yet.</p>
            )}
          </section>
          <section className="nm-avoid-break">
            <H>Still open</H>
            {open.length ? (
              <ul className="m-0 list-none space-y-2.5 p-0">
                {open.map((a) => {
                  const late = actionState(a, now) === 'overdue';
                  return (
                    <li key={a.id} className="text-sm leading-5">
                      <span className="font-medium">{a.title}</span>
                      <span className="block text-ui text-muted">
                        {a.ownerName} ·{' '}
                        <span className={late ? 'text-bad-text num' : 'num'}>
                          {late ? `${Math.ceil((now.getTime() - toMs(a.dueAt)) / DAY)} days overdue` : `due ${shortDate.format(toMs(a.dueAt))}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="m-0 text-sm text-muted">Nothing open.</p>
            )}
          </section>
        </div>

        <footer className="mt-8 grid grid-cols-3 gap-6 border-t border-line pt-4 text-xs text-muted nm-avoid-break">
          <div>
            Briefed by
            <div className="mt-6 border-b border-line-strong" />
          </div>
          <div>
            Date and shift
            <div className="mt-6 border-b border-line-strong" />
          </div>
          <div>
            Attendees
            <div className="mt-6 border-b border-line-strong" />
          </div>
        </footer>
      </article>
    </>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="m-0 mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">{children}</h2>;
}

function Fig({ label, value, bad }: { label: string; value: number | string; bad?: boolean }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-[11px] text-muted">{label}</dt>
      <dd className={`m-0 text-2xl font-semibold leading-none tracking-[-0.03em] num ${bad ? 'text-bad-text' : ''}`}>{value}</dd>
    </div>
  );
}
