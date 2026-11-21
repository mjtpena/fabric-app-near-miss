/**
 * App data types and runtime entity definitions. Keep these in step with rayfin/data/*.ts:
 * every field listed here must exist on the entity class with the matching decorator.
 * Dates are ISO strings in the app; optional fields are `| null`.
 */
import type { EntityDefs } from '@x10/shared/data';
import { AppMarkerDef, PersonDef, type AppMarker, type Person } from '@x10/shared/identity';

/** The same numbers as the decorators on the entities. */
export const limits = {
  siteName: { min: 3, max: 80 },
  zoneName: { min: 1, max: 60 },
  description: { min: 10, max: 1000 },
  immediateAction: { max: 500 },
  reporterName: { max: 100 },
  actionTitle: { min: 3, max: 150 },
  ownerName: { min: 1, max: 100 },
  verification: { max: 300 },
} as const;

/** Plan grid: zones and pins live on a 100 × 60 grid. */
export const GRID = { w: 100, h: 60 } as const;

export const SITE_KINDS = ['warehouse', 'plant', 'office', 'construction', 'retail'] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

export const ZONE_KINDS = ['room', 'yard', 'dock', 'store', 'route', 'plant', 'office', 'welfare'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

export const KINDS = ['near_miss', 'unsafe_condition', 'unsafe_act', 'good_catch'] as const;
export type ReportKind = (typeof KINDS)[number];

export const CATEGORIES = [
  'slips_trips_falls',
  'working_at_height',
  'vehicles_pedestrians',
  'manual_handling',
  'electrical',
  'chemicals',
  'machinery_guarding',
  'fire',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const POTENTIALS = ['low', 'medium', 'high', 'serious'] as const;
export type Potential = (typeof POTENTIALS)[number];

export const STATUSES = ['new', 'triaged', 'action_assigned', 'fixed', 'closed'] as const;
export type ReportStatus = (typeof STATUSES)[number];

export const ACTION_STATUSES = ['open', 'done'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export interface Site {
  id: string;
  name: string;
  kind: SiteKind;
  supervisorSub: string;
  supervisorName: string;
}

export interface Zone {
  id: string;
  siteId: string;
  name: string;
  kind: ZoneKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Report {
  id: string;
  siteId: string;
  zoneId: string | null;
  kind: ReportKind;
  category: Category;
  potential: Potential;
  description: string;
  immediateAction: string | null;
  anonymous: boolean;
  reporterSub: string | null;
  reporterName: string | null;
  reportedAt: string;
  status: ReportStatus;
  triagedBy: string | null;
  triagedByName: string | null;
  triagedAt: string | null;
  fixedAt: string | null;
  closedAt: string | null;
  x: number | null;
  y: number | null;
}

export interface Action {
  id: string;
  reportId: string;
  siteId: string;
  title: string;
  ownerSub: string;
  ownerName: string;
  dueAt: string;
  status: ActionStatus;
  doneAt: string | null;
  verification: string | null;
  createdBySub: string;
  createdAt: string;
}

export type Schema = {
  Person: Person;
  AppMarker: AppMarker;
  Site: Site;
  Zone: Zone;
  Report: Report;
  Action: Action;
};

export const defs: EntityDefs<Schema> = {
  Person: PersonDef,
  AppMarker: AppMarkerDef,
  Site: {
    name: 'Site',
    fields: { id: 'uuid', name: 'text', kind: 'set', supervisorSub: 'text', supervisorName: 'text' },
  },
  Zone: {
    name: 'Zone',
    fields: { id: 'uuid', siteId: 'uuid', name: 'text', kind: 'set', x: 'int', y: 'int', w: 'int', h: 'int' },
  },
  Report: {
    name: 'Report',
    fields: {
      id: 'uuid',
      siteId: 'uuid',
      zoneId: 'uuid',
      kind: 'set',
      category: 'set',
      potential: 'set',
      description: 'text',
      immediateAction: 'text',
      anonymous: 'bool',
      reporterSub: 'text',
      reporterName: 'text',
      reportedAt: 'date',
      status: 'set',
      triagedBy: 'text',
      triagedByName: 'text',
      triagedAt: 'date',
      fixedAt: 'date',
      closedAt: 'date',
      x: 'int',
      y: 'int',
    },
  },
  Action: {
    name: 'Action',
    fields: {
      id: 'uuid',
      reportId: 'uuid',
      siteId: 'uuid',
      title: 'text',
      ownerSub: 'text',
      ownerName: 'text',
      dueAt: 'date',
      status: 'set',
      doneAt: 'date',
      verification: 'text',
      createdBySub: 'text',
      createdAt: 'date',
    },
  },
};
