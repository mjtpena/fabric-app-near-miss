import { entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A workplace with a plan (warehouse, plant, office…) and the supervisor who triages its reports.
 * Read-only through the API: sites are set up by the safety lead with the seed script or SQL (no client writes, so
 * nobody can make themselves a site's supervisor through GraphQL).
 */
@entity()
@role('authenticated', 'read')
export class Site {
  @uuid() id!: string;
  @text({ min: 3, max: 80 }) name!: string;
  @set('warehouse', 'plant', 'office', 'construction', 'retail')
  kind!: 'warehouse' | 'plant' | 'office' | 'construction' | 'retail';
  @text({ min: 1, max: 255 }) supervisorSub!: string;
  @text({ min: 1, max: 100 }) supervisorName!: string;
}
