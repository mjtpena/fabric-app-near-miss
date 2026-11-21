/**
 * Lead indicators: the leading measures of a safety culture, by site. Reports per month (by kind), share of fixes
 * done by their due date, median days from report to fix, and good catches. Loaded lazily (Recharts).
 */
import { useMemo, useState } from 'react';

import { useApp } from '@x10/shared/runtime';
import { DAY, toMs, useAsync } from '@x10/shared/lib';
import { DataState, LoadingBlock, PageHeader, SegmentedControl, Stat, StatStrip, Table, TableWrap, Td, Th } from '@x10/shared/ui';
import { SimpleBarChart, SimpleLineChart } from '@x10/shared/charts';

import { kindLabels } from '../config';
import { monthlyIndicators, summarise } from '../domain/indicators';
import { loadAll, type PlanData } from '../domain/reports';
import { actionState } from '../domain/rules';
import { KINDS, type Schema } from '../model';

const KIND_COLOR = {
  near_miss: 'var(--orange-9)',
  unsafe_condition: 'var(--sky-9)',
  unsafe_act: 'var(--violet-9)',
  good_catch: 'var(--green-9)',
} as const;

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const days = (v: number | null) => (v === null ? '–' : v < 10 ? v.toFixed(1) : String(Math.round(v)));

export default function IndicatorsPage() {
  const { store } = useApp<Schema>();
  const data = useAsync(() => loadAll(store), [store]);
  return (
    <DataState state={data} skeleton={<LoadingBlock rows={10} />}>
      {(d) => <Indicators data={d} />}
    </DataState>
  );
}

function Indicators({ data }: { data: PlanData }) {
  const now = useMemo(() => new Date(), [data]);
  const [site, setSite] = useState('all');
  const reports = site === 'all' ? data.reports : data.reports.filter((r) => r.siteId === site);
  const actions = site === 'all' ? data.actions : data.actions.filter((a) => a.siteId === site);
  const cur = summarise(reports, actions, now, 30);
  const prev = summarise(reports, actions, new Date(now.getTime() - 30 * DAY), 30);
  const months = monthlyIndicators(reports, actions, now, 4);
  const rows = months.map((m) => ({
    month: m.label,
    ...m.byKind,
    goodCatches: m.goodCatches,
    onTime: m.onTimeRate === null ? null : Math.round(m.onTimeRate * 100),
    medianDays: m.medianDays === null ? 0 : Number(m.medianDays.toFixed(1)),
  }));
  const delta = (a: number | null, b: number | null, good: 'up' | 'down', fmt: (n: number) => string) =>
    a === null || b === null || a === b ? undefined : { value: fmt(Math.abs(a - b)), direction: a > b ? ('up' as const) : ('down' as const), good };
  const label = site === 'all' ? 'all sites' : data.sites.find((s) => s.id === site)?.name;

  return (
    <>
      <PageHeader
        title="Lead indicators"
        subtitle="What gets reported and fixed, before anyone gets hurt."
        actions={
          <SegmentedControl
            label="Site"
            value={site}
            onChange={setSite}
            options={[{ value: 'all', label: 'All sites' }, ...data.sites.map((s) => ({ value: s.id, label: s.name.split(' ')[0] }))]}
          />
        }
      />
      <StatStrip className="mb-8" columns={4}>
        <Stat label="Reports, 30 days" value={<span className="num">{cur.reports}</span>} delta={delta(cur.reports, prev.reports, 'up', String)} hint="More reports is good" />
        <Stat
          label="Fixed by due date"
          value={<span className="num">{pct(cur.onTimeRate)}</span>}
          delta={delta(cur.onTimeRate, prev.onTimeRate, 'up', (n) => `${Math.round(n * 100)} pts`)}
          hint="Actions due in 30 days"
        />
        <Stat label="Median days to fix" value={<span className="num">{days(cur.medianDays)}</span>} delta={delta(cur.medianDays, prev.medianDays, 'down', (n) => n.toFixed(1))} hint="Report to fix" />
        <Stat label="Good catches, 30 days" value={<span className="num">{cur.goodCatches}</span>} delta={delta(cur.goodCatches, prev.goodCatches, 'up', String)} hint="Hazards stopped early" />
      </StatStrip>

      <div className="grid gap-5 lg:grid-cols-2" data-testid="indicator-charts">
        <SimpleBarChart
          title="Reports per month"
          description="By kind"
          summary={`Reports per month for ${label}: ${months.map((m) => `${m.label} ${m.total}`).join(', ')}.`}
          data={rows}
          xKey="month"
          stacked
          series={KINDS.map((k) => ({ key: k, label: kindLabels[k], color: KIND_COLOR[k] }))}
          height={240}
        />
        <SimpleLineChart
          title="Fixed by the due date"
          description="Share of actions due each month that were done in time"
          summary={`Share fixed by the due date for ${label}: ${months.map((m) => `${m.label} ${pct(m.onTimeRate)}`).join(', ')}.`}
          data={rows}
          xKey="month"
          series={[{ key: 'onTime', label: 'Fixed by due date', color: 'var(--accent-10)' }]}
          yDomain={[0, 100]}
          yFormat={(v) => `${v}%`}
          height={240}
        />
        <SimpleBarChart
          title="Median days to fix"
          description="Reports fixed each month, report to fix"
          summary={`Median days to fix for ${label}: ${months.map((m) => `${m.label} ${days(m.medianDays)}`).join(', ')}.`}
          data={rows}
          xKey="month"
          series={[{ key: 'medianDays', label: 'Median days', color: 'var(--sky-9)' }]}
          height={220}
        />
        <SimpleBarChart
          title="Good catches"
          description="Hazards someone spotted and stopped"
          summary={`Good catches per month for ${label}: ${months.map((m) => `${m.label} ${m.goodCatches}`).join(', ')}.`}
          data={rows}
          xKey="month"
          series={[{ key: 'goodCatches', label: 'Good catches', color: 'var(--green-9)' }]}
          height={220}
        />
      </div>

      <h2 className="m-0 mt-10 mb-3 text-base font-semibold">By site, last 90 days</h2>
      <TableWrap label="Indicators by site">
        <Table density="compact" data-testid="site-table">
          <thead>
            <tr>
              <Th>Site</Th>
              <Th numeric>Reports</Th>
              <Th numeric>Good catches</Th>
              <Th numeric>Fixed by due date</Th>
              <Th numeric>Median days to fix</Th>
              <Th numeric>Open actions</Th>
              <Th numeric>Overdue</Th>
            </tr>
          </thead>
          <tbody>
            {data.sites.map((s) => {
              const rs = data.reports.filter((r) => r.siteId === s.id);
              const as = data.actions.filter((a) => a.siteId === s.id);
              const sum = summarise(rs, as, now, 90);
              const open = as.filter((a) => a.status === 'open');
              const overdue = open.filter((a) => actionState(a, now) === 'overdue').length;
              return (
                <tr key={s.id}>
                  <Td>{s.name}</Td>
                  <Td numeric>{sum.reports}</Td>
                  <Td numeric>{sum.goodCatches}</Td>
                  <Td numeric>{pct(sum.onTimeRate)}</Td>
                  <Td numeric>{days(sum.medianDays)}</Td>
                  <Td numeric>{open.length}</Td>
                  <Td numeric className={overdue ? 'text-bad-text' : undefined}>
                    {overdue}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
      <p className="m-0 mt-3 text-xs text-muted">
        Oldest report shown: {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(Math.min(...data.reports.map((r) => toMs(r.reportedAt))))}.
      </p>
    </>
  );
}
