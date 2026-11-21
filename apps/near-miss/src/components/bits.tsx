/**
 * Small display pieces shared by every screen: potential and status as dot + label, kind glyphs, category icons,
 * the reporter (or "Anonymous", with the reason), and the triage clock.
 */
import type { ReactNode } from 'react';
import {
  ArrowUpFromLine,
  Building2,
  Cog,
  Ellipsis,
  EyeOff,
  Factory,
  Flame,
  FlaskConical,
  Footprints,
  Forklift,
  Store,
  Warehouse,
  Weight,
  Zap,
  HardHat,
} from 'lucide-react';

import { HOUR, toMs } from '@x10/shared/lib';
import { cx } from '@x10/shared/ui';

import { categoryLabels, kindLabels, potentialLabels, statusLabels } from '../config';
import type { Category, Potential, Report, ReportKind, ReportStatus, SiteKind } from '../model';
import { CAT_VAR, POT_VAR, STATUS_VAR } from '../plan/palette';
import { triageClock, triageLimitHours } from '../domain/rules';

export function Dot({ color, size = 8, className }: { color: string; size?: number; className?: string }) {
  return <span aria-hidden="true" className={cx('inline-block shrink-0 rounded-full', className)} style={{ width: size, height: size, background: color }} />;
}

export function PotentialLabel({ potential, className }: { potential: Potential; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-ui', className)}>
      <Dot color={POT_VAR[potential]} />
      {potentialLabels[potential]}
    </span>
  );
}

export function StatusLabel({ status, className }: { status: ReportStatus; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-ui', className)}>
      <Dot color={STATUS_VAR[status]} />
      {statusLabels[status]}
    </span>
  );
}

const CAT_ICON: Record<Category, ReactNode> = {
  slips_trips_falls: <Footprints />,
  working_at_height: <ArrowUpFromLine />,
  vehicles_pedestrians: <Forklift />,
  manual_handling: <Weight />,
  electrical: <Zap />,
  chemicals: <FlaskConical />,
  machinery_guarding: <Cog />,
  fire: <Flame />,
  other: <Ellipsis />,
};

export function CategoryIcon({ category, className }: { category: Category; className?: string }) {
  return <span className={cx('inline-flex shrink-0 [&_svg]:size-4 [&_svg]:[stroke-width:1.75]', className)} aria-hidden="true">{CAT_ICON[category]}</span>;
}

export function CategoryLabel({ category, className }: { category: Category; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-ui', className)}>
      <span style={{ color: CAT_VAR[category] }} className="inline-flex">
        <CategoryIcon category={category} className="[&_svg]:size-3.5" />
      </span>
      {categoryLabels[category]}
    </span>
  );
}

const SITE_ICON: Record<SiteKind, ReactNode> = {
  warehouse: <Warehouse />,
  plant: <Factory />,
  office: <Building2 />,
  construction: <HardHat />,
  retail: <Store />,
};
export const SiteIcon = ({ kind }: { kind: SiteKind }) => <>{SITE_ICON[kind]}</>;

/** The glyph inside a pin head, by kind: dot, triangle, bar, star. Drawn in a 12 × 12 box centred on 0,0. */
export function KindGlyph({ kind, color = 'currentColor', size = 1 }: { kind: ReportKind; color?: string; size?: number }) {
  const s = size;
  switch (kind) {
    case 'near_miss':
      return <circle r={2.3 * s} fill={color} />;
    case 'unsafe_condition':
      return <path d={`M0 ${-2.9 * s} L${2.7 * s} ${2 * s} L${-2.7 * s} ${2 * s} Z`} fill={color} />;
    case 'unsafe_act':
      return <rect x={-1.1 * s} y={-2.9 * s} width={2.2 * s} height={5.8 * s} rx={0.9 * s} fill={color} />;
    default:
      return (
        <path
          d={star(3.2 * s, 1.4 * s)}
          fill={color}
        />
      );
  }
}

function star(R: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    pts.push(`${(Math.cos(a) * rad).toFixed(2)} ${(Math.sin(a) * rad).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

/** Kind as a small inline SVG + label, for lists. */
export function KindLabel({ kind, className }: { kind: ReportKind; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-ui', className)}>
      <svg viewBox="-6 -6 12 12" width={12} height={12} aria-hidden="true" className="text-muted">
        <KindGlyph kind={kind} />
      </svg>
      {kindLabels[kind]}
    </span>
  );
}

export function Reporter({ report, className }: { report: Pick<Report, 'anonymous' | 'reporterName'>; className?: string }) {
  if (report.anonymous || !report.reporterName)
    return (
      <span className={cx('inline-flex items-center gap-1.5 text-muted', className)} title="Reported anonymously: no name or account is stored">
        <EyeOff className="size-3.5" aria-hidden="true" strokeWidth={1.75} />
        Anonymous
      </span>
    );
  return <span className={className}>{report.reporterName}</span>;
}

function fmtHours(ms: number): string {
  const h = Math.abs(ms) / HOUR;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

/** "3 h past the 4 h limit", "21 h left", "Triaged in 2 h". */
export function triageText(r: Report, now: Date): { text: string; tone: 'bad' | 'warn' | 'ok' | 'neutral' } {
  const c = triageClock(r, now);
  const limit = triageLimitHours(r.potential);
  if (c.state === 'late') return { text: `${fmtHours(c.marginMs)} past the ${limit} h limit`, tone: 'bad' };
  if (c.state === 'waiting') return { text: `${fmtHours(c.marginMs)} left of ${limit} h`, tone: c.marginMs < limit * HOUR * 0.25 ? 'warn' : 'neutral' };
  const took = r.triagedAt ? toMs(r.triagedAt) - toMs(r.reportedAt) : 0;
  if (c.state === 'triaged_late') return { text: `Triaged in ${fmtHours(took)}, late`, tone: 'warn' };
  return { text: `Triaged in ${fmtHours(took)}`, tone: 'ok' };
}

export const TONE_TEXT: Record<string, string> = {
  bad: 'text-bad-text',
  warn: 'text-warn-text',
  ok: 'text-ok-text',
  neutral: 'text-muted',
  info: 'text-info-text',
};
