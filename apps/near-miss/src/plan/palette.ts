/**
 * Colour encodings shared by the site plan, the reports list, the toolbox talk and the indicators, so a colour means
 * the same thing everywhere. CSS variable strings only (both themes come from the tokens in index.css).
 */
import { AGE_BUCKETS, type AgeBucket } from '../config';
import type { Category, Potential, ReportStatus } from '../model';
import { DAY, toMs } from '@x10/shared/lib';

export const POT_VAR: Record<Potential, string> = {
  low: 'var(--pot-low)',
  medium: 'var(--pot-medium)',
  high: 'var(--pot-high)',
  serious: 'var(--pot-serious)',
};

export const STATUS_VAR: Record<ReportStatus, string> = {
  new: 'var(--st-new)',
  triaged: 'var(--st-triaged)',
  action_assigned: 'var(--st-action_assigned)',
  fixed: 'var(--st-fixed)',
  closed: 'var(--st-closed)',
};

export const CAT_VAR: Record<Category, string> = {
  slips_trips_falls: 'var(--sky-9)',
  working_at_height: 'var(--violet-9)',
  vehicles_pedestrians: 'var(--orange-9)',
  manual_handling: 'var(--bronze-9)',
  electrical: 'var(--gold-9)',
  chemicals: 'var(--magenta-9)',
  machinery_guarding: 'var(--teal-9)',
  fire: 'var(--crimson-9)',
  other: 'var(--gray-9)',
};

export const AGE_VAR: Record<AgeBucket, string> = {
  week: 'var(--age-week)',
  month: 'var(--age-month)',
  quarter: 'var(--age-quarter)',
  old: 'var(--age-old)',
};

export function ageBucket(reportedAt: string, t: number): AgeBucket {
  const days = (t - toMs(reportedAt)) / DAY;
  return (AGE_BUCKETS.find((b) => days < b.maxDays) ?? AGE_BUCKETS[AGE_BUCKETS.length - 1]).key;
}

/** Status dot tone for the kit's Badge/StatusDot. */
export const STATUS_TONE: Record<ReportStatus, 'bad' | 'warn' | 'info' | 'ok' | 'neutral'> = {
  new: 'bad',
  triaged: 'info',
  action_assigned: 'warn',
  fixed: 'ok',
  closed: 'neutral',
};

export const POT_TONE: Record<Potential, 'bad' | 'warn' | 'info' | 'neutral'> = {
  serious: 'bad',
  high: 'warn',
  medium: 'info',
  low: 'neutral',
};
