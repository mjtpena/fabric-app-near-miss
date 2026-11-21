/**
 * The plan's accessible equivalent: the same reports as a table (cards on phones), newest first, filterable by site
 * and status. Prints as a document.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';

import { formatDateTime, formatRelative } from '@x10/shared/lib';
import { EmptyState, FilterSelect, SearchInput, Table, TableWrap, Td, Th, Toolbar, useIsDesktop } from '@x10/shared/ui';

import { CategoryLabel, KindLabel, PotentialLabel, Reporter, StatusLabel, TONE_TEXT, triageText } from '../components/bits';
import { reportTitle } from '../domain/reports';
import type { Report, Site, Zone } from '../model';

type StatusFilter = 'all' | 'triage' | 'open' | 'done';

export function ReportList({ reports, sites, zones, siteId, now }: { reports: Report[]; sites: Site[]; zones: Zone[]; siteId: string | null; now: Date }) {
  const desktop = useIsDesktop();
  const [site, setSite] = useState<string>(siteId ?? 'all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');
  const zoneName = (id: string | null) => zones.find((z) => z.id === id)?.name ?? '—';
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? '';

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reports.filter((r) => {
      if (site !== 'all' && r.siteId !== site) return false;
      if (status === 'triage' && r.status !== 'new') return false;
      if (status === 'open' && (r.status === 'fixed' || r.status === 'closed')) return false;
      if (status === 'done' && r.status !== 'fixed' && r.status !== 'closed') return false;
      if (needle && !`${r.description} ${zoneName(r.zoneId)}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, site, status, q, zones]);

  return (
    <div data-testid="report-list">
      <Toolbar className="mb-4 x-noprint">
        <FilterSelect
          label="Site"
          value={site}
          onChange={setSite}
          options={[{ value: 'all', label: 'All sites' }, ...sites.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <FilterSelect<StatusFilter>
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All' },
            { value: 'triage', label: 'Needs triage' },
            { value: 'open', label: 'Open' },
            { value: 'done', label: 'Fixed or closed' },
          ]}
        />
        <SearchInput value={q} onChange={setQ} label="Search reports" placeholder="Search…" className="min-w-0 flex-1 sm:max-w-64" />
        <span className="ml-auto font-mono text-xs text-muted num" data-testid="list-count">
          {rows.length} report{rows.length === 1 ? '' : 's'}
        </span>
      </Toolbar>
      {rows.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="No reports match" bordered>
          Try another site or status.
        </EmptyState>
      ) : desktop ? (
        <TableWrap label="Reports">
          <Table density="compact" stickyHeader>
            <thead>
              <tr>
                <Th>Reported</Th>
                <Th>What</Th>
                <Th>Where</Th>
                <Th>Potential</Th>
                <Th>Status</Th>
                <Th>Triage</Th>
                <Th>Reporter</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tri = triageText(r, now);
                return (
                  <tr key={r.id} data-row-report={r.id}>
                    <Td className="whitespace-nowrap">
                      <span className="num" title={formatDateTime(r.reportedAt)}>
                        {formatRelative(r.reportedAt, now)}
                      </span>
                    </Td>
                    <Td className="max-w-[360px]">
                      <Link to={`/reports/${r.id}`} className="block truncate font-medium text-fg hover:underline">
                        {reportTitle(r)}
                      </Link>
                      <span className="mt-0.5 flex items-center gap-3 text-muted">
                        <KindLabel kind={r.kind} className="text-xs" />
                        <CategoryLabel category={r.category} className="text-xs" />
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {zoneName(r.zoneId)}
                      {site === 'all' && <span className="block text-xs text-muted">{siteName(r.siteId)}</span>}
                    </Td>
                    <Td>
                      <PotentialLabel potential={r.potential} />
                    </Td>
                    <Td>
                      <StatusLabel status={r.status} />
                    </Td>
                    <Td className={`whitespace-nowrap text-xs ${TONE_TEXT[tri.tone]}`}>
                      <span className="num">{tri.text}</span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <Reporter report={r} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      ) : (
        <ul className="m-0 list-none divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line bg-surface p-0">
          {rows.map((r) => {
            const tri = triageText(r, now);
            return (
              <li key={r.id} className="px-4 py-3" data-row-report={r.id}>
                <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
                  <span className="truncate">
                    {zoneName(r.zoneId)}
                    {site === 'all' && ` · ${siteName(r.siteId)}`}
                  </span>
                  <span className="shrink-0 num">{formatRelative(r.reportedAt, now)}</span>
                </div>
                <Link to={`/reports/${r.id}`} className="mt-1 block font-medium leading-5 text-fg">
                  {reportTitle(r)}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <PotentialLabel potential={r.potential} />
                  <StatusLabel status={r.status} />
                  {r.status === 'new' && <span className={`text-xs num ${TONE_TEXT[tri.tone]}`}>{tri.text}</span>}
                  <Reporter report={r} className="text-ui" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
