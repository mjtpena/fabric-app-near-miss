import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChartNoAxesColumn, EyeOff, ListChecks, MapPin, Presentation } from 'lucide-react';

import { PageHeader } from '@x10/shared/ui';

import { Dot, KindGlyph } from '../components/bits';
import {
  ACTION_DUE_DAYS,
  FIXED_HEAT_FACTOR,
  HEAT_HALF_LIFE_DAYS,
  HOT_MONTH_DAYS,
  HOTSPOT_WEIGHTS,
  HOTSPOT_WINDOW_DAYS,
  kindHelp,
  kindLabels,
  potentialHelp,
  potentialLabels,
  THANK_DAYS,
  TRIAGE_HOURS,
  URGENT_TRIAGE_HOURS,
} from '../config';
import { KINDS, POTENTIALS } from '../model';
import { POT_VAR } from '../plan/palette';

export function AboutPage() {
  return (
    <div className="max-w-[960px]">
      <PageHeader title="About Near-Miss" subtitle="Report a hazard in 30 seconds, fix it before anyone gets hurt, and see where the risks cluster." />

      <Block title="Why">
        <p className="m-0 max-w-[68ch] text-base leading-7 text-fg">
          Most serious injuries at work follow near misses and unsafe conditions that someone saw and did not report, because reporting was
          slow, on paper, or felt like getting a colleague in trouble. Near-Miss makes reporting quick, lets people keep their name off a
          report, and puts every report on a plan of the site so hazards get fixed where they cluster. Teams can then manage by leading
          indicators (hazards found and fixed) instead of lagging ones (injuries).
        </p>
      </Block>

      <Block title="How to read the plan">
        <ul className="m-0 list-none space-y-3 p-0 text-sm leading-6">
          <li>
            Each site is drawn as a plan: rooms and yards, walls and doors, racking, vehicle routes and numbered dock doors. Every report
            from the last {HOTSPOT_WINDOW_DAYS} days is a pin where it happened; a fixed hazard shrinks to a small check mark.
          </li>
          <li>
            Pins carry the kind of report in their head:
            <span className="ml-2 inline-flex flex-wrap gap-x-4 gap-y-1 align-middle">
              {KINDS.map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5 text-ui" title={kindHelp[k]}>
                  <svg viewBox="-6 -6 12 12" width={11} height={11} aria-hidden="true">
                    <KindGlyph kind={k} color="var(--muted)" />
                  </svg>
                  {kindLabels[k]}
                </span>
              ))}
            </span>
          </li>
          <li>Lenses re-colour the same pins by potential, status, category or age. The heat lens shows where hazards cluster.</li>
          <li>
            The time slider replays the last {HOTSPOT_WINDOW_DAYS} days: pins appear on the day they were reported, statuses and heat are as
            they were that day, so you can watch a hotspot form and cool after a fix. The{' '}
            <Link to="/?view=list" className="text-brand-text">
              list view
            </Link>{' '}
            holds the same reports as a table.
          </li>
        </ul>
      </Block>

      <Block title="The tools">
        <ul className="m-0 grid list-none gap-6 p-0 sm:grid-cols-2">
          <Tool icon={<MapPin />} name="Report" to="/report">
            The 30-second phone form: tap where it happened, pick the kind and how bad it could have been, one sentence, send.
          </Tool>
          <Tool icon={<ListChecks />} name="Fix list" to="/fixes">
            Every action by owner and due date, overdue first. Owners mark their own fixes done with a note of what was done.
          </Tool>
          <Tool icon={<Presentation />} name="Toolbox talk" to="/toolbox">
            A printable one-page briefing on one zone: what was reported, what was fixed, what is open, what to talk about.
          </Tool>
          <Tool icon={<ChartNoAxesColumn />} name="Lead indicators" to="/indicators">
            Reports per month, fixes done by their due date, median days to fix and good catches, by site.
          </Tool>
        </ul>
      </Block>

      <Block title="Anonymous reports">
        <div className="flex max-w-[68ch] gap-3 text-sm leading-6 text-fg">
          <EyeOff className="mt-1 size-4 shrink-0 text-muted" aria-hidden="true" />
          <p className="m-0">
            When you report anonymously, your name and account are <strong>not stored at all</strong>: the report has no reporter fields, so
            nobody, including the safety lead and anyone with database access, can see who reported it. The honest consequence is that
            nothing links the report to you, so you cannot edit it afterwards. A named report can be edited by the person who filed it until
            it is triaged.
          </p>
        </div>
      </Block>

      <Block title="Rules and thresholds">
        <ol className="m-0 list-decimal space-y-2.5 pl-5 text-sm leading-6 text-fg marker:font-mono marker:text-faint">
          <li>
            Every report is triaged within <strong className="num">{TRIAGE_HOURS} hours</strong>; high and serious potential within{' '}
            <strong className="num">{URGENT_TRIAGE_HOURS} hours</strong>. Late triage shows in Today.
          </li>
          <li>A serious potential report needs an action before it can move past triaged (to action assigned, fixed or closed).</li>
          <li>
            Action due dates default by potential:{' '}
            {POTENTIALS.slice()
              .reverse()
              .map((p) => `${potentialLabels[p].toLowerCase()} ${ACTION_DUE_DAYS[p]} days`)
              .join(', ')}
            . An action is overdue once it is open past its due date.
          </li>
          <li>
            Hotspots rank zones by a weighted count of reports over {HOTSPOT_WINDOW_DAYS} days:{' '}
            {POTENTIALS.slice()
              .reverse()
              .map((p) => `${potentialLabels[p].toLowerCase()} ${HOTSPOT_WEIGHTS[p]}`)
              .join(', ')}
            . Today names the hottest zone of the last {HOT_MONTH_DAYS} days.
          </li>
          <li>
            Heat on the plan uses the same weights, halves every {HEAT_HALF_LIFE_DAYS} days, and drops to{' '}
            {Math.round(FIXED_HEAT_FACTOR * 100)}% once the report is fixed. That is why a zone cools after its fix.
          </li>
          <li>
            Leading indicators: reports per month, the share of actions done by their due date (among actions done or past due), median days
            from report to fix, and good catches. Good catches from the last {THANK_DAYS} days show in Today to thank.
          </li>
          <li>Site supervisors triage and assign actions for their own site; the safety lead can for every site. Only an action’s owner can mark it done.</li>
        </ol>
      </Block>

      <Block title="Potential">
        <ul className="m-0 list-none space-y-2 p-0">
          {POTENTIALS.slice()
            .reverse()
            .map((p) => (
              <li key={p} className="flex items-baseline gap-3 text-sm">
                <span className="inline-flex w-20 shrink-0 items-center gap-1.5 font-medium">
                  <Dot color={POT_VAR[p]} />
                  {potentialLabels[p]}
                </span>
                <span className="text-muted">{potentialHelp[p]}</span>
              </li>
            ))}
        </ul>
      </Block>

      <Block title="Standards">
        <p className="m-0 max-w-[68ch] text-sm leading-6 text-fg">
          Near-Miss supports the hazard identification, worker participation and incident follow-up parts of an occupational health and
          safety management system such as ISO 45001: workers can report hazards without fear of reprisal, every report is assessed, and
          corrective actions are tracked to verified completion.
        </p>
        <p className="m-0 mt-3 max-w-[68ch] text-sm leading-6 text-muted">
          It supports the process; it is not legal, compliance or safety advice and does not replace a competent person’s risk assessment
          or your legal duty to report injuries and dangerous occurrences to the regulator.
        </p>
      </Block>

      <Block title="Privacy and audience">
        <p className="m-0 max-w-[68ch] text-sm leading-6 text-fg">
          Sign-in uses Fabric (Microsoft Entra ID). Everyone who can open the app can read every report, so describe the hazard, not the
          person. Named reports show the reporter’s display name; anonymous reports store nothing about the reporter.
        </p>
        <p className="m-0 mt-3 text-xs text-faint">Built by Datachain Consulting for AI @Work. Runs on Microsoft Fabric Apps.</p>
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-3 border-t border-line py-8 md:grid-cols-[200px_minmax(0,1fr)]">
      <h2 className="m-0 text-base font-semibold">{title}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Tool({ icon, name, to, children }: { icon: ReactNode; name: string; to: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className="group block text-fg no-underline">
        <span className="grid size-9 place-items-center rounded-lg bg-accent-3 text-accent-11 [&_svg]:size-4">{icon}</span>
        <span className="mt-3 block text-sm font-semibold group-hover:underline">{name}</span>
        <span className="mt-1 block text-ui leading-5 text-muted">{children}</span>
      </Link>
    </li>
  );
}
