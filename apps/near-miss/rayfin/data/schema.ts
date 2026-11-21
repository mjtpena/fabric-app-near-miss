import { Action } from './Action.js';
import { AppMarker } from './AppMarker.js';
import { Person } from './Person.js';
import { Report } from './Report.js';
import { Site } from './Site.js';
import { Zone } from './Zone.js';

export type AppSchema = {
  Person: Person;
  AppMarker: AppMarker;
  Site: Site;
  Zone: Zone;
  Report: Report;
  Action: Action;
};

export const schema = [Person, AppMarker, Site, Zone, Report, Action];
