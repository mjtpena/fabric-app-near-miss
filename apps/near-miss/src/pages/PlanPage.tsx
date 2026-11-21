/**
 * Home: the site plan. Lenses re-colour the same pins, Today focuses the plan on what needs attention, view-as
 * changes whose eyes you look through, the time slider replays 90 days, and the list view shows the same reports.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  ClipboardList,
  Flame,
  HardHat,
  Keyboard,
  Map as MapIcon,
  MapPin,
  Printer,
  Rows3,
  ShieldCheck,
} from 'lucide-react';

import { useApp } from '@x10/shared/runtime';
import { DAY, toMs, useAsync, usePolling } from '@x10/shared/lib';
import {
  Badge,
  Button,
  IconButton,
  Legend,
  LensBar,
  Menu,
  Skeleton,
  StageMessage,
  StagePage,
  TodayPanel,
  ViewAsSwitch,
  ViewToggle,
  useHotkeys,
  useIsDesktop,
  useReducedMotion,
  type LegendItem,
  type LensOption,
  type StageView,
  type TodayItem,
} from '@x10/shared/ui';

import { KindGlyph, SiteIcon } from '../components/bits';
import { AGE_BUCKETS, categoryLabels, kindLabels, potentialLabels, siteKindLabels, statusLabels } from '../config';
import { peakHeat, rankHotspots, statusAt } from '../domain/hotspots';
import { canTriage, homeRole, loadAll, type PlanData, type Role } from '../domain/reports';
import { rankToday, type LensKey } from '../domain/today';
import { CATEGORIES, KINDS, POTENTIALS, STATUSES, type Schema, type Site } from '../model';
import { PinCard, ZoneCard } from '../plan/cards';
import { AGE_VAR, ageBucket, CAT_VAR, POT_VAR, STATUS_VAR } from '../plan/palette';
import { PlanTimeline, REPLAY_DAYS } from '../plan/PlanTimeline';
import { ReportList } from '../plan/ReportList';
import { ShortcutsDialog } from '../plan/ShortcutsDialog';
import { SitePlan, type PlanFocus } from '../plan/SitePlan';

const LENSES: LensOption<LensKey>[] = [
  { value: 'potential', label: 'Potential', swatch: 'linear-gradient(90deg, var(--pot-low), var(--pot-medium), var(--pot-high), var(--pot-serious))', description: 'How bad it could have been' },
  { value: 'status', label: 'Status', swatch: 'conic-gradient(var(--st-new) 0 25%, var(--st-triaged) 0 50%, var(--st-action_assigned) 0 75%, var(--st-fixed) 0)', description: 'New, triaged, action assigned, fixed, closed' },
  { value: 'category', label: 'Category', swatch: 'conic-gradient(var(--orange-9) 0 25%, var(--violet-9) 0 50%, var(--sky-9) 0 75%, var(--magenta-9) 0)', description: 'What kind of hazard' },
  { value: 'age', label: 'Age', swatch: 'linear-gradient(90deg, var(--age-week), var(--age-old))', description: 'How long ago it was reported' },
  { value: 'heat', label: 'Heat', swatch: 'radial-gradient(circle, var(--heat-3), var(--heat-1))', description: 'Where hazards cluster (weighted by potential)' },
];

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function PlanPage() {
  const { store, me } = useApp<Schema>();
  const data = useAsync(() => loadAll(store), [store]);
  usePolling(data.reload, 5000);
  if (data.error && !data.data)
    return (
      <StagePage
        label="Site plan"
        title="Site plan"
        stage={
          <StageMessage icon={<AlertTriangle />} title="The site plan could not load" action={<Button onClick={() => void data.reload()}>Retry</Button>}>
            {data.error.message}
          </StageMessage>
        }
      />
    );
  if (!data.data)
    return (
      <StagePage
        label="Site plan"
        title={<Skeleton width={260} height={24} />}
        meta={<Skeleton width={180} height={14} />}
        stage={
          <div role="status" aria-label="Loading the site plan" className="absolute inset-y-0 left-0 grid w-[calc(100%-var(--side-w,0px))] place-items-center p-10">
            <div className="x-skeleton aspect-[5/3] w-[min(78%,900px)] rounded-md" />
          </div>
        }
      />
    );
  if (data.data.sites.length === 0)
    return (
      <StagePage
        label="Site plan"
        title="Site plan"
        stage={
          <StageMessage icon={<MapIcon />} title="No sites yet">
            The safety lead adds sites and their zones with the seed script or SQL (see the README).
          </StageMessage>
        }
      />
    );
  return <PlanStage data={data.data} me={me} />;
}

function defaultSite(d: PlanData, me: { sub: string; isAdmin: boolean | null }, now: Date): Site {
  const supervised = d.sites.find((s) => s.supervisorSub === me.sub && me.isAdmin !== true);
  if (supervised) return supervised;
  const mine = d.reports.filter((r) => r.reporterSub === me.sub).sort((a, b) => toMs(b.reportedAt) - toMs(a.reportedAt))[0];
  if (mine && me.isAdmin !== true) return d.sites.find((s) => s.id === mine.siteId) ?? d.sites[0];
  const top = rankHotspots(d.reports, d.zones, now)[0];
  return d.sites.find((s) => s.id === top?.zone.siteId) ?? d.sites[0];
}

function PlanStage({ data, me }: { data: PlanData; me: { sub: string; isAdmin: boolean | null; displayName: string } }) {
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const reduced = useReducedMotion();
  const [params, setParams] = useSearchParams();
  // A stable "now" per data load, so the plan does not drift between renders.
  const now = useMemo(() => new Date(), [data]);
  const nowMs = now.getTime();

  const setParam = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const site = data.sites.find((s) => s.id === params.get('site')) ?? defaultSite(data, me, now);
  const view: StageView = params.get('view') === 'list' ? 'list' : 'stage';
  const focusParam = params.get('focus');
  const focus: PlanFocus = focusParam?.startsWith('r:') ? { kind: 'report', id: focusParam.slice(2) } : focusParam?.startsWith('z:') ? { kind: 'zone', id: focusParam.slice(2) } : null;
  const setFocus = (f: PlanFocus) => setParam({ focus: f ? `${f.kind === 'report' ? 'r' : 'z'}:${f.id}` : null });
  const setView = (v: StageView) => setParam({ view: v === 'list' ? 'list' : null });
  const setSite = (s: Site) => {
    setParam({ site: s.id, focus: null });
    setT(null);
    setPlaying(false);
  };

  const initialLens = (params.get('lens') as LensKey | null) ?? 'potential';
  const [lens, setLensState] = useState<LensKey>(LENSES.some((l) => l.value === initialLens) ? initialLens : 'potential');
  const setLens = (l: LensKey) => {
    setLensState(l);
    if (params.get('lens')) setParam({ lens: null });
  };
  const [role, setRole] = useState<Role>(() => homeRole(me, data.sites));
  const [t, setT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [help, setHelp] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const tNow = t ?? nowMs;
  const from = nowMs - REPLAY_DAYS * DAY;

  // Replay: half a day every 50 ms, about nine seconds for 90 days.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setT((cur) => {
        const next = (cur ?? from) + DAY / 2;
        if (next >= nowMs) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, reduced ? 120 : 50);
    return () => window.clearInterval(id);
  }, [playing, from, nowMs, reduced]);
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (t === null || t >= nowMs - DAY) setT(from);
    setPlaying(true);
  };

  const siteZones = useMemo(() => data.zones.filter((z) => z.siteId === site.id), [data.zones, site.id]);
  const siteReports = useMemo(() => data.reports.filter((r) => r.siteId === site.id && nowMs - toMs(r.reportedAt) <= REPLAY_DAYS * DAY), [data.reports, site.id, nowMs]);
  const siteActions = useMemo(() => data.actions.filter((a) => a.siteId === site.id), [data.actions, site.id]);
  const hotspots = useMemo(() => rankHotspots(siteReports, siteZones, now), [siteReports, siteZones, now]);
  const heatMax = useMemo(() => peakHeat(data.reports, from, nowMs), [data.reports, from, nowMs]);
  const today = useMemo(() => rankToday(data, me, role, site.id, now), [data, me, role, site.id, now]);

  const focusedReport = focus?.kind === 'report' ? data.reports.find((r) => r.id === focus.id) : undefined;
  const focusedZone = focus?.kind === 'zone' ? siteZones.find((z) => z.id === focus.id) : undefined;
  const curveZone = focusedZone ?? siteZones.find((z) => z.id === focusedReport?.zoneId) ?? hotspots[0]?.zone ?? null;
  const visibleAtT = siteReports.filter((r) => toMs(r.reportedAt) <= tNow);
  const waiting = siteReports.filter((r) => r.status === 'new');
  const seriousWaiting = waiting.filter((r) => r.potential === 'serious' || r.potential === 'high');

  const pinOrder = useMemo(() => [...siteReports].filter((r) => toMs(r.reportedAt) <= tNow).sort((a, b) => toMs(a.reportedAt) - toMs(b.reportedAt)), [siteReports, tNow]);
  const step = (dir: 1 | -1) => {
    if (!pinOrder.length) return;
    const idx = focusedReport ? pinOrder.findIndex((r) => r.id === focusedReport.id) : -1;
    const next = idx < 0 ? (dir === 1 ? pinOrder.length - 1 : 0) : (idx + dir + pinOrder.length) % pinOrder.length;
    setFocus({ kind: 'report', id: pinOrder[next].id });
  };

  useHotkeys({
    escape: () => {
      setFocus(null);
      setPlaying(false);
      setT(null);
    },
    '[': () => view === 'stage' && step(-1),
    ']': () => view === 'stage' && step(1),
    s: () => {
      const i = data.sites.findIndex((x) => x.id === site.id);
      setSite(data.sites[(i + 1) % data.sites.length]);
    },
    p: () => view === 'stage' && togglePlay(),
    r: () => navigate(`/report?site=${site.id}`),
    'shift+?': () => setHelp(true),
  });

  const selectToday = (it: TodayItem) => {
    const p = today.find((x) => x.id === it.id);
    if (!p) return;
    setLens(p.lens);
    setPlaying(false);
    const sitePatch: Record<string, string | null> = p.focus.siteId ? { site: p.focus.siteId } : {};
    if (p.focus.kind === 'report') {
      setT(null);
      setParam({ ...sitePatch, view: null, focus: `r:${p.focus.id}` });
    } else if (p.focus.kind === 'zone') {
      setT(null);
      setParam({ ...sitePatch, view: null, focus: p.focus.id ? `z:${p.focus.id}` : null });
    } else {
      setParam({ ...sitePatch, view: null, focus: `z:${p.focus.id}` });
      setT(from);
      setPlaying(true);
    }
  };
  const activeToday =
    today.find((p) => (p.focus.kind === 'report' ? focus?.kind === 'report' && focus.id === p.focus.id : focus?.kind === 'zone' && focus.id === p.focus.id))?.id ?? null;

  const todayItems: TodayItem[] = today.map((p) => ({
    id: p.id,
    title: p.title,
    severity: p.tone,
    value: p.value,
    unit: p.unit,
    lens: LENSES.find((l) => l.value === p.lens)?.label,
    meta: <span className="truncate">{p.meta}</span>,
  }));

  const legendItems = legendFor(lens, visibleAtT, data, tNow);
  const shapeKey: LegendItem[] = [
    ...KINDS.map((k) => ({
      label: kindLabels[k],
      icon: (
        <svg viewBox="-6 -6 12 12" width={11} height={11} aria-hidden="true">
          <KindGlyph kind={k} color="var(--muted)" />
        </svg>
      ),
    })),
    {
      label: 'Fixed',
      icon: (
        <svg viewBox="-7 -7 14 14" width={12} height={12} aria-hidden="true">
          <circle r={5.6} fill="none" stroke="var(--st-fixed)" strokeWidth={1.6} />
          <path d="M-2.5 0.1 L-0.7 1.9 L2.7 -1.7" fill="none" stroke="var(--st-fixed)" strokeWidth={1.7} strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  const roleSwitch = (
    <ViewAsSwitch<Role>
      value={role}
      onChange={setRole}
      options={[
        { value: 'reporter', label: 'Reporter', icon: <HardHat /> },
        { value: 'supervisor', label: 'Supervisor', icon: <ClipboardList /> },
        { value: 'lead', label: 'Lead', icon: <ShieldCheck /> },
      ]}
    />
  );

  // The title is the site switcher: "Northgate Distribution Centre ⌄".
  const siteMenu = (
    <Menu
      label="Choose a site"
      width={320}
      trigger={
        <button
          type="button"
          data-testid="site-menu"
          aria-label={`Site: ${site.name}. Choose another site`}
          className="group inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-lg text-left hover:bg-[color-mix(in_oklab,var(--gray-12)_5%,transparent)]"
        >
          <span className="line-clamp-2 text-[18px] tracking-[-0.02em] md:hidden">{site.name}</span>
          <span className="hidden w-max max-w-[360px] truncate text-[19px] tracking-[-0.02em] md:block">{site.name}</span>
          <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-aria-expanded:rotate-180" aria-hidden="true" />
        </button>
      }
      items={data.sites.map((s) => ({
        label: s.name,
        description: `${siteKindLabels[s.kind]} · supervisor ${s.supervisorName}`,
        icon: <SiteIcon kind={s.kind} />,
        checked: s.id === site.id,
        role: 'menuitemradio' as const,
        onSelect: () => setSite(s),
      }))}
    />
  );

  const topRight = (
    <div className="x-noprint flex flex-wrap items-center gap-2">
      <Button variant="primary" icon={<MapPin />} onClick={() => navigate(`/report?site=${site.id}`)} className={view === 'stage' ? 'rounded-full!' : undefined} title="Report a hazard (R)">
        Report
      </Button>
      <ViewToggle value={view} onChange={setView} glass={view === 'stage'} stageLabel="Plan" listLabel="List" stageIcon={<MapIcon />} listIcon={<Rows3 />} />
      {desktop && view === 'stage' && (
        <IconButton label="Keyboard shortcuts (?)" icon={<Keyboard />} onClick={() => setHelp(true)} className="x-glass rounded-full!" />
      )}
      {view === 'list' && (
        <Button icon={<Printer />} onClick={() => window.print()}>
          Print
        </Button>
      )}
    </div>
  );

  const timeline = (
    <PlanTimeline
      now={nowMs}
      t={tNow}
      onChange={(v) => {
        setPlaying(false);
        setT(v >= nowMs - DAY / 8 ? null : v);
      }}
      playing={playing}
      onTogglePlay={togglePlay}
      reports={siteReports}
      actions={siteActions}
      zone={curveZone}
      heatPeak={heatMax}
    />
  );

  const card = focusedReport ? (
    <PinCard
      report={focusedReport}
      zone={data.zones.find((z) => z.id === focusedReport.zoneId)}
      site={data.sites.find((s) => s.id === focusedReport.siteId) ?? site}
      actions={data.actions.filter((a) => a.reportId === focusedReport.id && toMs(a.createdAt) <= tNow)}
      status={statusAt(focusedReport, data.actions, tNow) ?? focusedReport.status}
      now={now}
      replay={t !== null}
      canTriage={canTriage(me, data.sites.find((s) => s.id === focusedReport.siteId) ?? site)}
      onClose={() => setFocus(null)}
      className={desktop ? 'w-[330px]' : 'max-h-[62%] overflow-y-auto'}
    />
  ) : focusedZone ? (
    <ZoneCard
      zone={focusedZone}
      site={site}
      reports={siteReports}
      actions={siteActions}
      hotspots={hotspots}
      now={now}
      onClose={() => setFocus(null)}
      className={desktop ? 'w-[330px]' : ''}
    />
  ) : null;

  const insets = desktop ? { top: 118, right: card ? 360 : 28, bottom: 168, left: 28 } : { top: 60, right: 6, bottom: card ? 300 : 96, left: 6 };

  const stage = (
    <>
      <SitePlan
        key={site.id}
        site={site}
        zones={siteZones}
        reports={siteReports}
        actions={siteActions}
        lens={lens}
        role={role}
        meSub={me.sub}
        t={tNow}
        now={nowMs}
        heatPeak={heatMax}
        hotspots={hotspots}
        focus={focus}
        onFocus={setFocus}
        insets={insets}
        reducedMotion={reduced}
      />
      {desktop && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[calc(100%-var(--side-w,0px))]">
          {card && <div className="absolute right-4 top-[72px]">{card}</div>}
          <div className="pointer-events-auto absolute bottom-[74px] left-1/2 w-[min(680px,calc(100%-32px))] -translate-x-1/2">
            <div className="x-glass rounded-2xl px-2.5 py-2">{timeline}</div>
          </div>
        </div>
      )}
      {!desktop && (
        <div className="absolute inset-x-2 bottom-2 z-[1]">
          <div className="x-glass rounded-2xl px-2 py-1.5">{timeline}</div>
        </div>
      )}
      {!desktop && card && <div className="absolute inset-x-2 bottom-2 z-[2]">{card}</div>}
    </>
  );

  return (
    <>
      <StagePage
        label={`Site plan of ${site.name}`}
        view={view}
        breadcrumb={
          view === 'list'
            ? [{ label: 'Site plan', onClick: () => setView('stage') }, { label: 'Reports' }]
            : [{ label: 'Site plan', onClick: () => setFocus(null) }, { label: focusedZone?.name ?? data.zones.find((z) => z.id === focusedReport?.zoneId)?.name ?? siteKindLabels[site.kind] }]
        }
        title={view === 'list' ? 'Reports' : siteMenu}
        meta={
          view === 'list' ? (
            <span>Every report, newest first</span>
          ) : (
            <>
              <span className="num">
                <span className="font-mono">{siteReports.length}</span> reports · <span className="font-mono">{siteZones.length}</span> zones · <span className="font-mono">90</span> days
              </span>
              {seriousWaiting.length > 0 ? (
                <Badge tone="bad" pulse>
                  <span className="font-mono">{seriousWaiting.length}</span>&nbsp;urgent to triage
                </Badge>
              ) : waiting.length > 0 ? (
                <Badge tone="warn">
                  <span className="font-mono">{waiting.length}</span>&nbsp;to triage
                </Badge>
              ) : null}
            </>
          )
        }
        topRight={topRight}
        lenses={
          desktop ? (
            <div className="flex items-end gap-3">
              <LensBar lenses={LENSES} value={lens} onChange={setLens} />
              {roleSwitch}
            </div>
          ) : (
            <LensBar lenses={LENSES} value={lens} onChange={setLens} />
          )
        }
        legend={desktop && !sideOpen && <Legend title={LENSES.find((l) => l.value === lens)?.label} items={legendItems} collapsible defaultOpen={desktop} />}
        bottomRight={desktop ? undefined : roleSwitch}
        side={
          <>
            <TodayPanel
              bare
              items={todayItems}
              title="Today"
              date={dateFmt.format(now)}
              activeId={activeToday}
              empty="Nothing needs you today. Every report is triaged and every fix is on time."
              onSelect={selectToday}
            />
            <div className="mx-1 mt-4 border-t border-line px-2 pt-4">
              <Legend bare title={`Key · ${LENSES.find((l) => l.value === lens)?.label}`} items={legendItems} />
              <div className="mt-4">
                <Legend bare title="Pins" items={shapeKey} columns={2} />
              </div>
            </div>
          </>
        }
        sideCount={today.length}
        sideOpen={sideOpen}
        onSideOpenChange={setSideOpen}
        list={<ReportList reports={data.reports} sites={data.sites} zones={data.zones} siteId={site.id} now={now} />}
        stage={stage}
        background="var(--plan-paper)"
      >
      </StagePage>
      <ShortcutsDialog open={help} onClose={() => setHelp(false)} />
    </>
  );
}

function legendFor(lens: LensKey, rows: PlanData['reports'], data: PlanData, t: number): LegendItem[] {
  const count = (pred: (r: PlanData['reports'][number]) => boolean) => rows.filter(pred).length;
  if (lens === 'status')
    return STATUSES.map((s) => ({ label: statusLabels[s], color: STATUS_VAR[s], value: count((r) => statusAt(r, data.actions, t) === s) }));
  if (lens === 'category')
    return CATEGORIES.filter((c) => count((r) => r.category === c) > 0).map((c) => ({ label: categoryLabels[c], color: CAT_VAR[c], value: count((r) => r.category === c) }));
  if (lens === 'age') return AGE_BUCKETS.map((b) => ({ label: b.label, color: AGE_VAR[b.key], value: count((r) => ageBucket(r.reportedAt, t) === b.key) }));
  if (lens === 'heat')
    return [
      { label: 'Hotspot', color: 'var(--heat-3)', shape: 'square' },
      { label: 'Warm', color: 'var(--heat-2)', shape: 'square' },
      { label: 'Cooling', color: 'var(--heat-1)', shape: 'square' },
      { label: 'Pins: potential', icon: <Flame className="size-3 text-muted" aria-hidden="true" /> },
    ];
  return [...POTENTIALS].reverse().map((p) => ({ label: potentialLabels[p], color: POT_VAR[p], value: count((r) => r.potential === p) }));
}
