import { boolean, date, entity, int, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A hazard, near miss, unsafe act or good catch, pinned on a site plan.
 *
 * Security (README "Security model"):
 * - read: every signed-in user (site hazards are shared so everyone can see where the risks are).
 * - create, two shapes only, and always in status "new" with no triage fields:
 *   named: reporterSub = the caller's sub and anonymous = false;
 *   anonymous: anonymous = true and BOTH reporter fields null. Nothing that identifies the reporter is stored.
 *   The DSL compiles `item.reporterSub.eq(null)` to `@item.reporterSub eq null`; see README Known limits.
 * - update: who reported, when, where (site) and whether it was anonymous can never change. The policy DSL cannot
 *   say "the site's supervisor or the safety lead" (no admin claim, and the supervisor lives on Site), so triage
 *   permissions, the reporter's "edit while new" and "anonymous reports cannot be edited" are enforced in
 *   src/domain/reports.ts.
 * - delete: nobody. Reports are closed, never deleted, so the history and the hotspots stay honest.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) =>
    claims.sub
      .eq(item.reporterSub)
      .and(item.anonymous.eq(false))
      .or(item.anonymous.eq(true).and(item.reporterSub.eq(null)).and(item.reporterName.eq(null)))
      .and(item.status.eq('new')),
  exclude: ['triagedBy', 'triagedByName', 'triagedAt', 'fixedAt', 'closedAt'],
})
@role('authenticated', 'update', {
  exclude: ['siteId', 'anonymous', 'reporterSub', 'reporterName', 'reportedAt'],
})
export class Report {
  @uuid() id!: string;
  @uuid() siteId!: string;
  @uuid({ optional: true }) zoneId?: string;
  @set('near_miss', 'unsafe_condition', 'unsafe_act', 'good_catch')
  kind!: 'near_miss' | 'unsafe_condition' | 'unsafe_act' | 'good_catch';
  @set(
    'slips_trips_falls',
    'working_at_height',
    'vehicles_pedestrians',
    'manual_handling',
    'electrical',
    'chemicals',
    'machinery_guarding',
    'fire',
    'other',
  )
  category!:
    | 'slips_trips_falls'
    | 'working_at_height'
    | 'vehicles_pedestrians'
    | 'manual_handling'
    | 'electrical'
    | 'chemicals'
    | 'machinery_guarding'
    | 'fire'
    | 'other';
  @set('low', 'medium', 'high', 'serious') potential!: 'low' | 'medium' | 'high' | 'serious';
  @text({ min: 10, max: 1000 }) description!: string;
  @text({ max: 500, optional: true }) immediateAction?: string;
  @boolean() anonymous!: boolean;
  @text({ max: 255, optional: true }) reporterSub?: string;
  @text({ max: 100, optional: true }) reporterName?: string;
  @date() reportedAt!: Date;
  @set('new', 'triaged', 'action_assigned', 'fixed', 'closed')
  status!: 'new' | 'triaged' | 'action_assigned' | 'fixed' | 'closed';
  @text({ max: 255, optional: true }) triagedBy?: string;
  @text({ max: 100, optional: true }) triagedByName?: string;
  @date({ optional: true }) triagedAt?: Date;
  @date({ optional: true }) fixedAt?: Date;
  @date({ optional: true }) closedAt?: Date;
  @int({ min: 0, max: 100, optional: true }) x?: number;
  @int({ min: 0, max: 60, optional: true }) y?: number;
}
