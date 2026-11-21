/**
 * One report: what happened, where (the plan, cropped to the zone), the status track, and the triage desk where the
 * site supervisor (or the safety lead) triages, assigns fixes and closes it. The reporter can edit a named report
 * while it is new; anonymous reports can never be edited.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, EyeOff, Pencil, SearchX } from 'lucide-react';

import { useApp } from '@x10/shared/runtime';
import { DAY, formatDateTime, formatRelative, toDateInput, toMs, useAction, useAsync, usePolling } from '@x10/shared/lib';
import {
  Button,
  Callout,
  DataState,
  Dialog,
  EmptyState,
  Field,
  InlineError,
  Input,
  LoadingBlock,
  PageHeader,
  SegmentedControl,
  Select,
  TextArea,
  cx,
} from '@x10/shared/ui';

import { CategoryLabel, Dot, KindLabel, PotentialLabel, Reporter, StatusLabel, TONE_TEXT, triageText } from '../components/bits';
import { categoryLabels, kindLabels, potentialLabels, statusLabels } from '../config';
import {
  assignAction,
  canTriage,
  completeAction,
  editReport,
  loadAll,
  reportTitle,
  setStatus,
  triageReport,
  type PlanData,
} from '../domain/reports';
import { actionState, checkEdit, defaultDueDays, nextStatuses, triageLimitHours } from '../domain/rules';
import { CATEGORIES, KINDS, limits, POTENTIALS, STATUSES, type Action, type Category, type Potential, type Report, type ReportKind, type Schema } from '../model';
import { MiniPlan } from '../plan/MiniPlan';
import { POT_VAR, STATUS_VAR } from '../plan/palette';

const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

export function ReportDetailPage() {
  const { id = '' } = useParams();
  const { store } = useApp<Schema>();
  const data = useAsync(() => loadAll(store), [store]);
  usePolling(data.reload, 5000);
  return (
    <DataState
      state={data}
      isEmpty={(d) => !d.reports.some((r) => r.id === id)}
      empty={
        <EmptyState icon={<SearchX />} title="Report not found" action={<Link to="/">Back to the site plan</Link>}>
          It may have been filed on another site, or the link is wrong.
        </EmptyState>
      }
      skeleton={<LoadingBlock rows={8} />}
    >
      {(d) => <Detail data={d} report={d.reports.find((r) => r.id === id)!} reload={data.reload} />}
    </DataState>
  );
}

function Detail({ data, report: r, reload }: { data: PlanData; report: Report; reload: () => Promise<void> }) {
  const { me } = useApp<Schema>();
  const [params] = useSearchParams();
  const now = useMemo(() => new Date(), [data]);
  const site = data.sites.find((s) => s.id === r.siteId)!;
  const zone = data.zones.find((z) => z.id === r.zoneId);
  const actions = data.actions.filter((a) => a.reportId === r.id).sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
  const mayTriage = canTriage(me, site);
  const editWhy = checkEdit(r, me.sub);
  const [editing, setEditing] = useState(false);
  const desk = useRef<HTMLElement>(null);

  useEffect(() => {
    if (params.get('triage') && desk.current) {
      desk.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
      desk.current.focus({ preventScroll: true });
    }
  }, [params]);

  const tri = triageText(r, now);
  const zoneReports = data.reports.filter((x) => x.zoneId === r.zoneId && x.id !== r.id && now.getTime() - toMs(x.reportedAt) < 90 * DAY);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to={`/?site=${site.id}&focus=r:${r.id}`} className="inline-flex items-center gap-1">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Site plan
          </Link>
        }
        title={reportTitle(r)}
        meta={
          <>
            <KindLabel kind={r.kind} />
            <CategoryLabel category={r.category} />
            <span>
              {zone?.name ?? 'No zone'} · {site.name}
            </span>
            <span className="num" title={formatDateTime(r.reportedAt)}>
              {formatRelative(r.reportedAt, now)}
            </span>
            <Reporter report={r} />
          </>
        }
        actions={
          !editWhy ? (
            <Button icon={<Pencil />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : undefined
        }
      />

      <StatusTrack report={r} actions={actions} />

      <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="what-h">
            <h2 id="what-h" className="m-0 mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              What happened
            </h2>
            <p className="m-0 max-w-[65ch] text-base leading-6 text-fg" data-testid="report-description">
              {r.description}
            </p>
            {r.immediateAction && (
              <p className="m-0 mt-3 max-w-[65ch] border-l-2 border-accent-7 pl-3 text-sm text-muted">
                <span className="font-medium text-fg">Done on the spot: </span>
                {r.immediateAction}
              </p>
            )}
          </section>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ui">
            <dt className="text-muted">Potential</dt>
            <dd className="m-0">
              <PotentialLabel potential={r.potential} />
            </dd>
            <dt className="text-muted">Status</dt>
            <dd className="m-0" data-testid="report-status">
              <StatusLabel status={r.status} />
            </dd>
            <dt className="text-muted">Triage</dt>
            <dd className={cx('m-0 num', TONE_TEXT[tri.tone])} data-testid="detail-triage-clock">
              {tri.text}
              {r.triagedByName && <span className="text-muted"> · by {r.triagedByName}</span>}
            </dd>
            <dt className="text-muted">Supervisor</dt>
            <dd className="m-0">{site.supervisorName}</dd>
          </dl>
          {r.anonymous && (
            <Callout icon={<EyeOff />} title="Reported anonymously">
              No name or account is stored with this report, so nobody can see who reported it, and nobody can edit it.
            </Callout>
          )}
          {zone && (
            <section aria-labelledby="where-h">
              <h2 id="where-h" className="m-0 mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                Where · {zone.name}
                {zoneReports.length > 0 && <span className="normal-case tracking-normal"> · {zoneReports.length} other reports here in 90 days</span>}
              </h2>
              <MiniPlan
                zones={data.zones.filter((z) => z.siteId === site.id)}
                siteKind={site.kind}
                crop={zone}
                highlightZoneId={zone.id}
                pins={zoneReports
                  .filter((x) => x.x !== null)
                  .map((x) => ({ id: x.id, x: x.x!, y: x.y!, color: 'var(--gray-8)', kind: x.kind, fixed: x.status === 'fixed' || x.status === 'closed' }))}
                picked={r.x !== null && r.y !== null ? { x: r.x, y: r.y } : null}
                label={`Where it happened: ${zone.name}, ${site.name}`}
                className="overflow-hidden rounded-xl border border-line"
              />
            </section>
          )}
        </div>

        <section ref={desk} tabIndex={-1} aria-labelledby="desk-h" className="min-w-0 outline-none" data-testid="triage-desk">
          <h2 id="desk-h" className="m-0 mb-3 text-base font-semibold">
            {mayTriage ? 'Triage desk' : 'Fixes'}
          </h2>
          {mayTriage && r.status === 'new' && <TriageForm report={r} reload={reload} />}
          <ActionList actions={actions} now={now} reload={reload} />
          {mayTriage && r.status !== 'fixed' && r.status !== 'closed' && <AssignForm report={r} data={data} now={now} reload={reload} />}
          {mayTriage && <StatusButtons report={r} actions={actions} reload={reload} />}
          {!mayTriage && (
            <p className="m-0 mt-4 text-ui text-muted">
              {site.supervisorName} (site supervisor) triages and assigns fixes for {site.name}.
            </p>
          )}
        </section>
      </div>

      {editing && <EditDialog report={r} onClose={() => setEditing(false)} reload={reload} />}
    </>
  );
}

/* ------------------------------------------------------------------ status track */

function StatusTrack({ report: r, actions }: { report: Report; actions: Action[] }) {
  const at: Record<string, string | null> = {
    new: r.reportedAt,
    triaged: r.triagedAt,
    action_assigned: actions[0]?.createdAt ?? null,
    fixed: r.fixedAt,
    closed: r.closedAt,
  };
  const idx = STATUSES.indexOf(r.status);
  return (
    <ol className="m-0 grid list-none grid-cols-5 gap-0 p-0" aria-label="Status" data-testid="status-track">
      {STATUSES.map((s, i) => {
        const done = i <= idx && (s !== 'action_assigned' || actions.length > 0);
        const current = s === r.status;
        return (
          <li key={s} className="relative min-w-0" aria-current={current ? 'step' : undefined}>
            <div className="flex items-center">
              <span
                className={cx('relative z-[1] grid size-3.5 shrink-0 place-items-center rounded-full border-2', current && 'ring-4 ring-[color-mix(in_oklab,var(--accent-9)_25%,transparent)]')}
                style={{ borderColor: done ? STATUS_VAR[s] : 'var(--line-strong)', background: done ? STATUS_VAR[s] : 'var(--surface)' }}
              />
              {i < STATUSES.length - 1 && <span className="h-0.5 flex-1" style={{ background: i < idx ? STATUS_VAR[STATUSES[i + 1]] : 'var(--line)' }} />}
            </div>
            <div className={cx('mt-2 pr-2 text-xs leading-4', current ? 'font-semibold text-fg' : done ? 'text-fg' : 'text-faint')}>{statusLabels[s]}</div>
            <div className="text-[11px] text-muted num">{at[s] && done ? shortDate.format(toMs(at[s]!)) : ''}</div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ triage */

function TriageForm({ report: r, reload }: { report: Report; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const [potential, setPotential] = useState<Potential>(r.potential);
  const [category, setCategory] = useState<Category>(r.category);
  const catId = useId();
  const run = useAction(async () => {
    await triageReport(store, me, r.id, { potential, category });
    await reload();
  });
  return (
    <div className="mb-5 rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 text-ui text-muted">
        Confirm how bad it could have been. {potentialLabels[potential]} is triaged within <span className="num">{triageLimitHours(potential)}</span> h.
      </div>
      <SegmentedControl<Potential>
        label="Potential"
        value={potential}
        onChange={setPotential}
        fullWidth
        options={POTENTIALS.map((p) => ({ value: p, label: potentialLabels[p], icon: <Dot color={POT_VAR[p]} size={7} /> }))}
      />
      <div className="mt-3 flex items-end gap-2">
        <Field label="Category" htmlFor={catId} className="mb-0 min-w-0 flex-1">
          <Select id={catId} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" busy={run.pending} onClick={() => void run.run()}>
          Mark triaged
        </Button>
      </div>
      <InlineError error={run.error} />
    </div>
  );
}

function ActionList({ actions, now, reload }: { actions: Action[]; now: Date; reload: () => Promise<void> }) {
  const { me } = useApp<Schema>();
  const [doing, setDoing] = useState<Action | null>(null);
  if (!actions.length) return <p className="m-0 mb-4 text-ui text-muted">No actions yet.</p>;
  return (
    <>
      <ul className="m-0 mb-4 list-none divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line bg-surface p-0" data-testid="action-list">
        {actions.map((a) => {
          const st = actionState(a, now);
          return (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
              <span className="pt-1.5">
                <Dot color={st === 'overdue' ? 'var(--bad-solid)' : st.startsWith('done') ? 'var(--st-fixed)' : 'var(--st-action_assigned)'} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-5">{a.title}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {a.ownerName} ·{' '}
                  {st === 'overdue' ? (
                    <span className="text-bad-text num">{Math.ceil((now.getTime() - toMs(a.dueAt)) / DAY)} days overdue</span>
                  ) : st === 'open' ? (
                    <span className="num">due {shortDate.format(toMs(a.dueAt))}</span>
                  ) : (
                    <span className="num">
                      done {shortDate.format(toMs(a.doneAt!))}
                      {st === 'done_late' ? ', after the due date' : ''}
                    </span>
                  )}
                </div>
                {a.verification && <div className="mt-1 text-ui text-muted">{a.verification}</div>}
              </div>
              {a.status === 'open' && a.ownerSub === me.sub && (
                <Button size="sm" onClick={() => setDoing(a)}>
                  Mark done
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {doing && <DoneDialog action={doing} onClose={() => setDoing(null)} reload={reload} />}
    </>
  );
}

export function DoneDialog({ action, onClose, reload }: { action: Action; onClose: () => void; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const [note, setNote] = useState('');
  const id = useId();
  const run = useAction(async () => {
    await completeAction(store, me, action.id, note);
    await reload();
    onClose();
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Mark done"
      description={action.title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={run.pending} onClick={() => void run.run()}>
            Mark done
          </Button>
        </>
      }
    >
      <Field label="What was done" htmlFor={id} hint="So the team can check it worked." counter={{ value: note.length, max: limits.verification.max }}>
        <TextArea id={id} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Barrier fitted and walked through with the shift." />
      </Field>
      <InlineError error={run.error} />
    </Dialog>
  );
}

function AssignForm({ report: r, data, now, reload }: { report: Report; data: PlanData; now: Date; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const days = defaultDueDays(r.potential);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState(toDateInput(new Date(now.getTime() + days * DAY).toISOString()));
  const ids = { t: useId(), o: useId(), d: useId() };
  const run = useAction(async () => {
    await assignAction(store, me, r.id, { title, ownerSub: owner, dueAt: new Date(`${due}T17:00`).toISOString() });
    setTitle('');
    setOwner('');
    await reload();
  });
  return (
    <form
      className="mb-5 rounded-xl border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run.run();
      }}
      data-testid="assign-form"
    >
      <div className="mb-3 text-sm font-medium">Assign a fix</div>
      <Field label="Action" htmlFor={ids.t} counter={{ value: title.length, max: limits.actionTitle.max }}>
        <Input id={ids.t} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fit a barrier at the crossing" />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Field label="Owner" htmlFor={ids.o}>
          <Select id={ids.o} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Choose…</option>
            {data.people.map((p) => (
              <option key={p.sub} value={p.sub}>
                {p.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due" htmlFor={ids.d} hint={`${potentialLabels[r.potential]}: ${days} days`}>
          <Input id={ids.d} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center justify-end">
        <Button type="submit" variant="primary" busy={run.pending}>
          Assign action
        </Button>
      </div>
      <InlineError error={run.error} />
    </form>
  );
}

function StatusButtons({ report: r, actions, reload }: { report: Report; actions: Action[]; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const next = nextStatuses(r.status).filter((s): s is 'fixed' | 'closed' => s === 'fixed' || s === 'closed');
  const run = useAction(async (to: 'fixed' | 'closed') => {
    await setStatus(store, me, r.id, to);
    await reload();
  });
  if (!next.length) return null;
  const blocked = r.potential === 'serious' && actions.length === 0;
  return (
    <div className="mt-2" data-testid="status-buttons">
      <div className="flex flex-wrap items-center gap-2">
        {next.map((s) => (
          <Button key={s} onClick={() => void run.run(s)} busy={run.pending}>
            {s === 'fixed' ? 'Mark fixed' : r.status === 'triaged' ? 'Close, no action needed' : 'Close'}
          </Button>
        ))}
      </div>
      {blocked && !run.error && <p className="m-0 mt-2 text-ui text-muted">Serious potential: assign an action before it can be fixed or closed.</p>}
      {run.error && (
        <Callout tone="bad" className="mt-3" title="Not yet">
          <span data-testid="status-error">{run.error.message}</span>
        </Callout>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ edit */

function EditDialog({ report: r, onClose, reload }: { report: Report; onClose: () => void; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const [kind, setKind] = useState<ReportKind>(r.kind);
  const [category, setCategory] = useState<Category>(r.category);
  const [potential, setPotential] = useState<Potential>(r.potential);
  const [description, setDescription] = useState(r.description);
  const [immediate, setImmediate] = useState(r.immediateAction ?? '');
  const ids = { k: useId(), c: useId(), d: useId(), i: useId() };
  const run = useAction(async () => {
    await editReport(store, me, r.id, { kind, category, potential, description, immediateAction: immediate });
    await reload();
    onClose();
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit report"
      description="You can edit your report until it is triaged."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={run.pending} onClick={() => void run.run()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="Kind" htmlFor={ids.k}>
          <Select id={ids.k} value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabels[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor={ids.c}>
          <Select id={ids.c} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mb-4">
        <SegmentedControl<Potential>
          label="Potential"
          value={potential}
          onChange={setPotential}
          fullWidth
          options={POTENTIALS.map((p) => ({ value: p, label: potentialLabels[p], icon: <Dot color={POT_VAR[p]} size={7} /> }))}
        />
      </div>
      <Field label="What happened" htmlFor={ids.d} counter={{ value: description.length, max: limits.description.max }}>
        <TextArea id={ids.d} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="What you did about it" htmlFor={ids.i} counter={{ value: immediate.length, max: limits.immediateAction.max }}>
        <TextArea id={ids.i} rows={2} value={immediate} onChange={(e) => setImmediate(e.target.value)} />
      </Field>
      <InlineError error={run.error} />
    </Dialog>
  );
}

