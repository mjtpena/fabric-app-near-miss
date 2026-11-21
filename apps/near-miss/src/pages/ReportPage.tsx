/**
 * Report: the 30-second phone form. Tap where it happened on the plan, pick what kind of hazard and how bad it could
 * have been, write one sentence, choose whether your name is stored, send. Five taps on a phone.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, EyeOff, MapPin, Plus, UserRound } from 'lucide-react';

import { useApp } from '@x10/shared/runtime';
import { useAction, useAsync } from '@x10/shared/lib';
import { Button, DataState, EmptyState, Field, InlineError, LinkButton, Select, Skeleton, Switch, TextArea, cx } from '@x10/shared/ui';

import { CategoryIcon, Dot } from '../components/bits';
import { categoryShort, kindLabels, potentialHelp, potentialLabels, TRIAGE_HOURS, URGENT_POTENTIALS, URGENT_TRIAGE_HOURS } from '../config';
import { fileReport, loadSites, validateReport, type ReportErrors, type ReportInput } from '../domain/reports';
import { CATEGORIES, KINDS, limits, POTENTIALS, type Category, type Potential, type Report, type ReportKind, type Schema, type Site, type Zone } from '../model';
import { MiniPlan } from '../plan/MiniPlan';
import { POT_VAR } from '../plan/palette';

const LAST_SITE = 'nm:last-site';

function readLastSite(): string | null {
  try {
    return localStorage.getItem(LAST_SITE);
  } catch {
    return null;
  }
}

export function ReportPage() {
  const { store } = useApp<Schema>();
  const data = useAsync(() => loadSites(store), [store]);
  return (
    <DataState
      state={data}
      isEmpty={(d) => d.sites.length === 0}
      empty={<EmptyState icon={<MapPin />} title="No sites to report on yet">The safety lead sets up sites and their plans first.</EmptyState>}
      skeleton={<FormSkeleton />}
    >
      {(d) => <ReportForm sites={d.sites} zones={d.zones} />}
    </DataState>
  );
}

function FormSkeleton() {
  return (
    <div role="status" aria-label="Loading the form" className="grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Skeleton height={300} />
      <div className="space-y-4">
        <Skeleton height={80} />
        <Skeleton height={44} />
        <Skeleton height={100} />
      </div>
    </div>
  );
}

function ReportForm({ sites, zones }: { sites: Site[]; zones: Zone[] }) {
  const { store, me } = useApp<Schema>();
  const [params] = useSearchParams();
  const initialSite = sites.find((s) => s.id === params.get('site')) ?? sites.find((s) => s.id === readLastSite()) ?? sites.find((s) => s.supervisorSub === me.sub) ?? sites[sites.length - 1];
  const [siteId, setSiteId] = useState(initialSite.id);
  const siteZones = useMemo(() => zones.filter((z) => z.siteId === siteId), [zones, siteId]);
  const site = sites.find((s) => s.id === siteId)!;
  const presetZone = siteZones.find((z) => z.id === params.get('zone')) ?? null;

  const [zoneId, setZoneId] = useState<string | null>(presetZone?.id ?? null);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(presetZone ? { x: presetZone.x + presetZone.w / 2, y: presetZone.y + presetZone.h / 2 } : null);
  const [kind, setKind] = useState<ReportKind>('near_miss');
  const [category, setCategory] = useState<Category | null>(null);
  const [potential, setPotential] = useState<Potential | null>(null);
  const [description, setDescription] = useState('');
  const [immediate, setImmediate] = useState('');
  const [showImmediate, setShowImmediate] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [errors, setErrors] = useState<ReportErrors>({});
  const [sent, setSent] = useState<{ report: Report; seconds: number | null } | null>(null);
  const started = useRef<number | null>(null);
  const touch = () => {
    started.current ??= Date.now();
  };
  const ids = { zone: useId(), desc: useId(), imm: useId() };

  useEffect(() => {
    try {
      localStorage.setItem(LAST_SITE, siteId);
    } catch {
      /* ignore */
    }
  }, [siteId]);

  const input: ReportInput = { siteId, zoneId, kind, category, potential, description, immediateAction: immediate, anonymous, x: pin?.x ?? null, y: pin?.y ?? null };
  const send = useAction(async () => {
    const e = validateReport(input);
    setErrors(e);
    if (Object.keys(e).length) return;
    const report = await fileReport(store, me, input);
    setSent({ report, seconds: started.current ? Math.round((Date.now() - started.current) / 1000) : null });
  });

  const reset = () => {
    setSent(null);
    setZoneId(null);
    setPin(null);
    setKind('near_miss');
    setCategory(null);
    setPotential(null);
    setDescription('');
    setImmediate('');
    setShowImmediate(false);
    setAnonymous(false);
    setErrors({});
    started.current = null;
  };

  if (sent) return <Sent report={sent.report} seconds={sent.seconds} site={site} zones={siteZones} onAnother={reset} />;

  const zone = siteZones.find((z) => z.id === zoneId);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void send.run();
      }}
      className="pb-2"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em]">Report a hazard</h1>
        <label className="flex items-center gap-2 text-ui text-muted">
          <span>Site</span>
          <Select
            value={siteId}
            onChange={(e) => {
              setSiteId(e.target.value);
              setZoneId(null);
              setPin(null);
            }}
            aria-label="Site"
            className="max-w-[230px]"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="grid gap-x-8 gap-y-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* WHERE */}
        <section aria-labelledby="where-h" className="min-w-0">
          <Caption id="where-h">
            Where
            {zone ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent-3 px-2 py-0.5 font-sans text-xs font-medium normal-case tracking-normal text-accent-11" data-testid="picked-zone">
                <MapPin className="size-3" aria-hidden="true" />
                {zone.name}
              </span>
            ) : (
              <span className="ml-2 font-sans text-xs font-normal normal-case tracking-normal text-muted">Tap the plan where it happened</span>
            )}
          </Caption>
          <MiniPlan
            zones={siteZones}
            siteKind={site.kind}
            picked={pin}
            highlightZoneId={zoneId}
            label={`Plan of ${site.name}: tap where it happened`}
            onPick={(x, y, z) => {
              touch();
              setPin({ x, y });
              setZoneId(z?.id ?? null);
              setErrors((e) => ({ ...e, zoneId: z ? undefined : 'That spot is outside every zone. Tap inside the plan.' }));
            }}
            className={cx('overflow-hidden rounded-xl border bg-[var(--plan-paper)]', errors.zoneId ? 'border-bad-line' : 'border-line')}
          />
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor={ids.zone} className="shrink-0 text-xs text-muted">
              or choose a zone
            </label>
            <Select
              id={ids.zone}
              value={zoneId ?? ''}
              controlSize="sm"
              onChange={(e) => {
                touch();
                const z = siteZones.find((x) => x.id === e.target.value) ?? null;
                setZoneId(z?.id ?? null);
                setPin(z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : null);
              }}
              className="min-w-0 flex-1"
            >
              <option value="">Zone…</option>
              {siteZones
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
            </Select>
          </div>
          {errors.zoneId && <p className="m-0 mt-1.5 text-ui text-bad-text">{errors.zoneId}</p>}
        </section>

        <div className="min-w-0 space-y-6">
          {/* WHAT */}
          <section aria-labelledby="what-h">
            <Caption id="what-h">What</Caption>
            <div role="radiogroup" aria-label="Kind of report" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4">
              {KINDS.map((k) => (
                <Chip key={k} on={kind === k} onClick={() => (touch(), setKind(k))} className="justify-center">
                  {kindLabels[k]}
                </Chip>
              ))}
            </div>
            <div role="radiogroup" aria-label="Category" className="mt-3 grid grid-cols-3 gap-1.5">
              {CATEGORIES.map((c) => (
                <Chip key={c} on={category === c} onClick={() => (touch(), setCategory(c), setErrors((e) => ({ ...e, category: undefined })))} className="flex-col gap-1 py-2.5" tall>
                  <CategoryIcon category={c} className="[&_svg]:size-[18px]" />
                  <span className="text-xs">{categoryShort[c]}</span>
                </Chip>
              ))}
            </div>
            {errors.category && <p className="m-0 mt-1.5 text-ui text-bad-text">{errors.category}</p>}
          </section>

          {/* HOW BAD */}
          <section aria-labelledby="pot-h">
            <Caption id="pot-h">How bad could it have been</Caption>
            <div role="radiogroup" aria-label="Potential" className="grid grid-cols-4 gap-1.5">
              {POTENTIALS.map((p) => (
                <Chip key={p} on={potential === p} onClick={() => (touch(), setPotential(p), setErrors((e) => ({ ...e, potential: undefined })))} className="justify-center gap-1.5">
                  <Dot color={POT_VAR[p]} />
                  {potentialLabels[p]}
                </Chip>
              ))}
            </div>
            <p className={cx('m-0 mt-1.5 min-h-5 text-ui', errors.potential ? 'text-bad-text' : 'text-muted')}>
              {errors.potential ??
                (potential
                  ? `${potentialHelp[potential]}. Triaged within ${URGENT_POTENTIALS.includes(potential) ? URGENT_TRIAGE_HOURS : TRIAGE_HOURS} hours.`
                  : '')}
            </p>
          </section>

          {/* WHAT HAPPENED */}
          <section aria-labelledby="desc-h">
            <Field label="What happened" htmlFor={ids.desc} error={errors.description} counter={{ value: description.length, max: limits.description.max }}>
              <TextArea
                id={ids.desc}
                rows={3}
                value={description}
                placeholder="One sentence is enough: what, and what nearly happened."
                onChange={(e) => {
                  touch();
                  setDescription(e.target.value);
                }}
                invalid={!!errors.description}
              />
            </Field>
            {showImmediate ? (
              <Field label="What you did about it" htmlFor={ids.imm} error={errors.immediateAction} counter={{ value: immediate.length, max: limits.immediateAction.max }}>
                <TextArea id={ids.imm} rows={2} value={immediate} onChange={(e) => setImmediate(e.target.value)} placeholder="Coned it off, told the driver…" />
              </Field>
            ) : (
              <Button type="button" variant="ghost" size="sm" icon={<Plus />} onClick={() => setShowImmediate(true)} className="-ml-2">
                Add what you did about it
              </Button>
            )}
          </section>

          {/* NAME */}
          <section aria-labelledby="anon-h" className="rounded-xl border border-line bg-surface px-4 py-3.5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div id="anon-h" className="flex items-center gap-2 text-sm font-medium">
                  {anonymous ? <EyeOff className="size-4 text-muted" aria-hidden="true" /> : <UserRound className="size-4 text-muted" aria-hidden="true" />}
                  Report anonymously
                </div>
                <p className="m-0 mt-1 text-ui text-muted" data-testid="anon-note">
                  {anonymous
                    ? 'Your name and account are not stored at all, so nobody, not even the safety lead, can see who reported it. That also means you cannot edit it afterwards.'
                    : `Sent as ${me.displayName}. You can edit it until it is triaged.`}
                </p>
              </div>
              <Switch checked={anonymous} onChange={(v) => (touch(), setAnonymous(v))} label="Report anonymously" />
            </div>
          </section>
          <div className="hidden md:block">
            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <span className="min-w-0 truncate text-ui text-muted">
                {[zone?.name, category && categoryShort[category], potential && potentialLabels[potential]].filter(Boolean).join(' · ') || 'Where, what and how bad'}
              </span>
              <Button type="submit" variant="primary" size="lg" busy={send.pending} className="min-w-44" icon={<Check />}>
                Send report
              </Button>
            </div>
            <InlineError error={send.error} />
          </div>
        </div>
      </div>
      <div className="sticky bottom-[var(--x-bottom-inset,0px)] z-10 -mx-4 mt-6 border-t border-line bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <span className="hidden min-w-0 truncate text-ui text-muted sm:inline">
            {[zone?.name, category && categoryShort[category], potential && potentialLabels[potential]].filter(Boolean).join(' · ') || 'Where, what and how bad'}
          </span>
          <Button type="submit" variant="primary" size="lg" busy={send.pending} className="w-full sm:w-auto sm:min-w-44" icon={<Check />}>
            Send report
          </Button>
        </div>
        <InlineError error={send.error} />
      </div>

    </form>
  );
}

function Caption({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="m-0 mb-2 flex flex-wrap items-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
      {children}
    </h2>
  );
}

function Chip({ on, onClick, children, className, tall }: { on: boolean; onClick: () => void; children: ReactNode; className?: string; tall?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-2.5 text-ui font-medium transition-[background-color,border-color,color,box-shadow] duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
        on
          ? 'border-[var(--gray-12)] bg-[var(--gray-12)] text-[var(--gray-1)] shadow-xs'
          : 'border-line-strong bg-surface text-fg hover:border-[var(--gray-8)] hover:bg-surface-2',
        tall && 'min-h-16 md:min-h-14',
        className,
      )}
    >
      {children}
    </button>
  );
}

function Sent({ report, seconds, site, zones, onAnother }: { report: Report; seconds: number | null; site: Site; zones: Zone[]; onAnother: () => void }) {
  const zone = zones.find((z) => z.id === report.zoneId);
  const urgent = URGENT_POTENTIALS.includes(report.potential);
  return (
    <div className="mx-auto max-w-xl" data-testid="report-sent">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-accent-9 text-accent-contrast">
          <Check className="size-5" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em]">Report sent</h1>
          <p className="m-0 text-ui text-muted">
            {seconds !== null && seconds > 0 && <span className="num">In {seconds} s. </span>}
            {site.supervisorName} triages it within {urgent ? URGENT_TRIAGE_HOURS : TRIAGE_HOURS} hours.
          </p>
        </div>
      </div>
      <MiniPlan
        zones={zones}
        siteKind={site.kind}
        picked={report.x !== null && report.y !== null ? { x: report.x, y: report.y } : null}
        highlightZoneId={report.zoneId}
        label={`Your report on the plan of ${site.name}`}
        className="overflow-hidden rounded-xl border border-line"
      />
      <dl className="m-0 mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ui">
        <dt className="text-muted">Where</dt>
        <dd className="m-0">{zone?.name ?? '—'}</dd>
        <dt className="text-muted">Potential</dt>
        <dd className="m-0 flex items-center gap-1.5">
          <Dot color={POT_VAR[report.potential]} />
          {potentialLabels[report.potential]}
        </dd>
        <dt className="text-muted">Name</dt>
        <dd className="m-0" data-testid="sent-name">
          {report.anonymous ? (
            <span className="inline-flex items-center gap-1.5">
              <EyeOff className="size-3.5 text-muted" aria-hidden="true" />
              Not stored. Nobody can see who reported it, and it cannot be edited.
            </span>
          ) : (
            <>{report.reporterName}. You can edit it until it is triaged.</>
          )}
        </dd>
      </dl>
      <div className="mt-6 flex flex-wrap gap-2">
        <LinkButton to={`/?site=${report.siteId}&focus=r:${report.id}`} variant="primary" icon={<MapPin />}>
          See it on the plan
        </LinkButton>
        <Button onClick={onAnother} icon={<Plus />}>
          Report another
        </Button>
        {!report.anonymous && (
          <Link to={`/reports/${report.id}`} className="ml-auto self-center text-ui text-brand-text hover:underline">
            Open the report
          </Link>
        )}
      </div>
    </div>
  );
}
