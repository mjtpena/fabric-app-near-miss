import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A fix assigned to someone for a report. "Overdue" is computed (open and past dueAt), never stored.
 *
 * Security:
 * - read: every signed-in user (the fix list is shared).
 * - create: only as yourself (createdBySub = your sub) and only "open", without completion fields. That the creator is
 *   the site's supervisor or the safety lead is enforced in src/domain/reports.ts (no admin claim).
 * - update: only the action's owner, and only the completion fields (status, doneAt, verification).
 * - delete: nobody (an action that is no longer needed is completed with a note).
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.createdBySub).and(item.status.eq('open')),
  exclude: ['doneAt', 'verification'],
})
@role('authenticated', 'update', {
  policy: (claims, item) => claims.sub.eq(item.ownerSub),
  include: ['status', 'doneAt', 'verification'],
})
export class Action {
  @uuid() id!: string;
  @uuid() reportId!: string;
  @uuid() siteId!: string;
  @text({ min: 3, max: 150 }) title!: string;
  @text({ min: 1, max: 255 }) ownerSub!: string;
  @text({ min: 1, max: 100 }) ownerName!: string;
  @date() dueAt!: Date;
  @set('open', 'done') status!: 'open' | 'done';
  @date({ optional: true }) doneAt?: Date;
  @text({ max: 300, optional: true }) verification?: string;
  @text({ min: 1, max: 255 }) createdBySub!: string;
  @date() createdAt!: Date;
}
