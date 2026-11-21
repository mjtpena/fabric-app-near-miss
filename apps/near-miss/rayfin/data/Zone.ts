import { entity, int, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A rectangle on a site's plan (a 100 × 60 grid): a room, a yard, a dock, racking, a vehicle route…
 * `kind` decides how the plan draws it (racks in stores, a centre line on routes, dock doors on docks).
 * Read-only through the API, like Site.
 */
@entity()
@role('authenticated', 'read')
export class Zone {
  @uuid() id!: string;
  @uuid() siteId!: string;
  @text({ min: 1, max: 60 }) name!: string;
  @set('room', 'yard', 'dock', 'store', 'route', 'plant', 'office', 'welfare')
  kind!: 'room' | 'yard' | 'dock' | 'store' | 'route' | 'plant' | 'office' | 'welfare';
  @int({ min: 0, max: 100 }) x!: number;
  @int({ min: 0, max: 60 }) y!: number;
  @int({ min: 1, max: 100 }) w!: number;
  @int({ min: 1, max: 60 }) h!: number;
}
