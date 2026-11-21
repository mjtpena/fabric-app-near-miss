/**
 * App configuration. No React imports here: tools/seed-fabric.mjs loads this file in Node to export seed rows.
 */
import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { defs, type Schema } from './model';
import { seed } from './seed';

/**
 * First persona = the safety lead (admin) and the default viewer; she also supervises Harbour Office, so a real
 * admin mapped onto her by the seed script can triage straight away. Two site supervisors and an operator show the
 * other roles.
 */
export const personas: Persona[] = [
  { sub: 'demo-lead', name: 'Dana Whitfield', email: 'dana@example.com', isAdmin: true, role: 'Safety lead' },
  { sub: 'demo-priya', name: 'Priya Raman', email: 'priya@example.com', isAdmin: false, role: 'Supervisor' },
  { sub: 'demo-tom', name: 'Tom Okoro', email: 'tom@example.com', isAdmin: false, role: 'Supervisor' },
  { sub: 'demo-sam', name: 'Sam Taylor', email: 'sam@example.com', isAdmin: false, role: 'Operator' },
];

export const config: AppConfig<Schema> = {
  appId: 'near-miss',
  title: 'Near-Miss',
  tagline: 'Report a hazard in 30 seconds. Fix it before anyone gets hurt.',
  defs,
  personas,
  seed,
  accent: 'lime',
  // A map pin over a warning chevron: a hazard, located.
  logoPaths: ['M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z', 'M12 7v3.5', 'M12 13h.01'],
  // Phone tab-bar icons are added in main.tsx so this file stays JSX-free.
  nav: [
    { to: '/', label: 'Site plan', end: true },
    { to: '/report', label: 'Report' },
    { to: '/fixes', label: 'Fix list' },
    { to: '/indicators', label: 'Lead indicators' },
    { to: '/toolbox', label: 'Toolbox talk' },
    { to: '/about', label: 'About' },
  ],
};
