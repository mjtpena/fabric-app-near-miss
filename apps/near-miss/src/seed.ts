/**
 * Fictional, generic seed data. Dates are computed from ctx.now. Runs once (runSeed checks a marker row).
 *
 * Three sites with 10–12 zones each and 75 reports over 90 days. The story the data tells:
 * - Northgate's loading dock, where the forklift route and the pedestrian shortcut cross at doors 1–4, collects a run
 *   of high and serious near misses. Three quick fixes do not stop it; a barrier and signal-controlled crossing,
 *   finished 35 days ago, does. It stays the top hotspot over 90 days, and the replay shows it cooling.
 * - This month the heat has moved to racking aisles E–H (working at height), with overdue actions.
 * - A serious near miss at the despatch bay is past its 4 h triage time; a few others wait past 24 h.
 * - Anonymous reports, good catches and actions in every state (open, overdue, done on time, done late).
 */
import type { DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { DAY, HOUR } from '@x10/shared/lib';
import type { SeedContext } from '@x10/shared/runtime';

import { ACTION_DUE_DAYS } from './config';
import type { Category, Potential, Report, ReportKind, ReportStatus, Schema, SiteKind, ZoneKind } from './model';

type Who = 'anon' | 'dana' | 'priya' | 'tom' | 'sam' | 'lee' | 'ana' | 'ravi' | 'mia';

interface SiteSpec {
  key: string;
  name: string;
  kind: SiteKind;
  supervisor: Who;
  zones: [key: string, name: string, kind: ZoneKind, x: number, y: number, w: number, h: number][];
}

const SITES: SiteSpec[] = [
  {
    key: 'north',
    name: 'Northgate Distribution Centre',
    kind: 'warehouse',
    supervisor: 'priya',
    zones: [
      ['yard', 'Goods-in yard', 'yard', 0, 0, 20, 24],
      ['marsh', 'Marshalling area', 'room', 20, 0, 24, 12],
      ['dock', 'Loading dock', 'dock', 20, 12, 24, 12],
      ['rackA', 'Racking aisles A–D', 'store', 44, 0, 30, 24],
      ['rackB', 'Racking aisles E–H', 'store', 74, 0, 26, 24],
      ['route', 'Forklift route', 'route', 0, 24, 100, 6],
      ['pick', 'Pick and pack', 'room', 0, 30, 32, 18],
      ['carpark', 'Car park walkway', 'yard', 0, 48, 46, 12],
      ['battery', 'Battery charging', 'plant', 32, 30, 14, 18],
      ['welfare', 'Canteen and lockers', 'welfare', 46, 30, 28, 14],
      ['office', 'Offices', 'office', 46, 44, 28, 16],
      ['despatch', 'Despatch bay', 'dock', 74, 30, 26, 30],
    ],
  },
  {
    key: 'east',
    name: 'Eastside Plant',
    kind: 'plant',
    supervisor: 'tom',
    zones: [
      ['yard', 'Goods yard', 'yard', 0, 0, 22, 26],
      ['press', 'Press shop', 'plant', 22, 0, 30, 26],
      ['paint', 'Paint line', 'plant', 52, 0, 26, 26],
      ['chem', 'Chemical store', 'store', 78, 0, 22, 14],
      ['comp', 'Compressor house', 'plant', 78, 14, 22, 12],
      ['aisle', 'Main aisle', 'route', 0, 26, 100, 6],
      ['assembly', 'Assembly line', 'plant', 0, 32, 40, 28],
      ['maint', 'Maintenance workshop', 'room', 40, 32, 22, 16],
      ['crib', 'Tool crib', 'store', 40, 48, 22, 12],
      ['canteen', 'Canteen', 'welfare', 62, 32, 18, 28],
      ['offices', 'Offices', 'office', 80, 32, 20, 28],
    ],
  },
  {
    key: 'harbour',
    name: 'Harbour Office',
    kind: 'office',
    supervisor: 'dana',
    zones: [
      ['reception', 'Reception', 'office', 0, 0, 24, 34],
      ['openplan', 'Open-plan floor', 'office', 24, 0, 46, 34],
      ['meeting', 'Meeting rooms', 'office', 70, 0, 30, 20],
      ['server', 'Server room', 'plant', 70, 20, 14, 14],
      ['print', 'Print and post room', 'room', 84, 20, 16, 14],
      ['corridor', 'Main corridor', 'route', 0, 34, 100, 6],
      ['kitchen', 'Kitchen', 'welfare', 0, 40, 24, 20],
      ['stair', 'Stairwell', 'room', 24, 40, 14, 20],
      ['bike', 'Bike store', 'yard', 38, 40, 24, 20],
      ['archive', 'Archive', 'store', 62, 40, 38, 20],
    ],
  },
];

/** People who are not demo personas: action owners and reporters. */
const EXTRA_PEOPLE: [Who, string, string][] = [
  ['lee', 'Lee Hart', 'demo-lee'],
  ['ana', 'Ana Costa', 'demo-ana'],
  ['ravi', 'Ravi Patel', 'demo-ravi'],
  ['mia', 'Mia Novak', 'demo-mia'],
];

interface ActionSpec {
  title: string;
  owner: Who;
  /** Days after triage the action was created (default 0.1). */
  after?: number;
  /** Due this many days after creation (default: by potential). */
  dueDays?: number;
  /** Done this many days after creation; omitted = still open. */
  doneDays?: number;
  verification?: string;
}

interface Spec {
  site: string;
  zone: string;
  /** Days ago it was reported (fractions allowed). */
  ago: number;
  kind: ReportKind;
  category: Category;
  potential: Potential;
  status: ReportStatus;
  who: Who;
  text: string;
  did?: string;
  /** Hours from report to triage (default 3). */
  triageH?: number;
  /** For fixed/closed reports without actions: days from triage to fix (default 2), or an absolute "days ago". */
  fixAgo?: number;
  actions?: ActionSpec[];
  /** Pin area inside the zone [x, y, w, h], to cluster pins (the dock crossing). */
  area?: [number, number, number, number];
}

const DOCK_CROSSING: [number, number, number, number] = [21.5, 18.5, 10, 4.5];
const BARRIER_DONE_AGO = 35;

const REPORTS: Spec[] = [
  /* ---------------- Northgate: the loading dock hotspot ---------------- */
  { site: 'north', zone: 'dock', ago: 84, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'high', status: 'closed', who: 'anon', area: DOCK_CROSSING, fixAgo: BARRIER_DONE_AGO,
    text: 'Forklift reversed out of door 2 as a picker walked behind it. The horn was not used and the picker had headphones in.' },
  { site: 'north', zone: 'dock', ago: 80, kind: 'unsafe_condition', category: 'vehicles_pedestrians', potential: 'medium', status: 'closed', who: 'sam', area: DOCK_CROSSING,
    text: 'There is no marked walkway past doors 1 to 4, so people walk straight through the forklift turning space.',
    actions: [{ title: 'Mark a temporary walkway past doors 1 to 4', owner: 'ravi', doneDays: 4, verification: 'Yellow walkway taped and signed; to be replaced by the permanent barrier.' }] },
  { site: 'north', zone: 'dock', ago: 76, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'serious', status: 'closed', who: 'anon', area: DOCK_CROSSING,
    text: 'A pedestrian stepped out between two trailers at door 3 and a loaded forklift had to brake hard. Missed by about a metre.',
    actions: [{ title: 'Brief all forklift drivers on horn use and reversing at the dock', owner: 'ravi', doneDays: 1, verification: 'Briefed all three shifts; signed register in the dock office.' }] },
  { site: 'north', zone: 'dock', ago: 73, kind: 'unsafe_act', category: 'vehicles_pedestrians', potential: 'high', status: 'closed', who: 'ravi', area: DOCK_CROSSING,
    text: 'Visiting drivers wait on the dock instead of in the drivers’ room, standing right in the forklift path.',
    actions: [{ title: 'Sign the drivers’ room and brief the gatehouse', owner: 'priya', doneDays: 5, verification: 'Signs up at the gate and dock; gatehouse hands out a route card.' }] },
  { site: 'north', zone: 'dock', ago: 70, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'high', status: 'closed', who: 'anon', area: DOCK_CROSSING, fixAgo: BARRIER_DONE_AGO,
    text: 'Forklift mast clipped the light post at door 1 while a colleague was walking through the gap.' },
  { site: 'north', zone: 'dock', ago: 67, kind: 'unsafe_condition', category: 'slips_trips_falls', potential: 'medium', status: 'closed', who: 'lee', area: DOCK_CROSSING,
    text: 'Rain blows in at door 4 and the dock plate gets slippery exactly where people cross.',
    actions: [{ title: 'Fit anti-slip strips to the door 4 dock plate', owner: 'lee', dueDays: 14, doneDays: 19, verification: 'Strips fitted after the supplier delay.' }] },
  { site: 'north', zone: 'dock', ago: 64, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'serious', status: 'closed', who: 'anon', area: DOCK_CROSSING,
    text: 'A trailer pulled away from door 2 while the forklift was still on the dock plate. The forklift stopped at the edge.',
    actions: [{ title: 'Fit trailer restraints at doors 1 to 4', owner: 'lee', dueDays: 10, doneDays: 9, verification: 'Restraints fitted and tested; drivers get the key only after release.' }] },
  { site: 'north', zone: 'dock', ago: 61, kind: 'unsafe_act', category: 'vehicles_pedestrians', potential: 'high', status: 'closed', who: 'sam', area: DOCK_CROSSING, fixAgo: BARRIER_DONE_AGO,
    text: 'People use the dock as a shortcut to the canteen at shift change, right across the forklift lane.' },
  { site: 'north', zone: 'dock', ago: 58, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'high', status: 'closed', who: 'anon', area: DOCK_CROSSING, fixAgo: BARRIER_DONE_AGO,
    text: 'A pallet truck and a forklift met head on at the blind corner by door 1.' },
  { site: 'north', zone: 'dock', ago: 55, kind: 'unsafe_condition', category: 'vehicles_pedestrians', potential: 'medium', status: 'closed', who: 'priya', area: DOCK_CROSSING,
    text: 'The convex mirror at the dock corner is cracked and shows nothing useful.',
    actions: [{ title: 'Replace the convex mirror at the dock corner', owner: 'lee', doneDays: 3, verification: 'New mirror fitted and angled to the crossing.' }] },
  { site: 'north', zone: 'dock', ago: 52, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'serious', status: 'closed', who: 'anon', area: DOCK_CROSSING,
    text: 'A forklift carrying a double stack could not see a person crossing at door 3 and stopped with a metre to spare.',
    actions: [{ title: 'Stop double stacking through the dock', owner: 'ravi', doneDays: 1, verification: 'Single stack only through doors 1 to 4; added to the dock rules board.' }] },
  { site: 'north', zone: 'dock', ago: 50, kind: 'near_miss', category: 'manual_handling', potential: 'medium', status: 'closed', who: 'ravi', area: DOCK_CROSSING, fixAgo: BARRIER_DONE_AGO,
    text: 'A loose load slid off a pallet at door 4 as a colleague walked past.' },
  { site: 'north', zone: 'dock', ago: 48, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'high', status: 'closed', who: 'anon', area: DOCK_CROSSING, fixAgo: BARRIER_DONE_AGO,
    text: 'An agency picker walked across the dock while three forklifts were loading. Nobody stopped them.' },
  { site: 'north', zone: 'dock', ago: 47, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'serious', status: 'closed', who: 'sam', area: DOCK_CROSSING, triageH: 1,
    text: 'Forklift and pedestrian at the same gap between trailers again. This is the third time this month I have seen it.',
    did: 'Stopped the forklift and walked the person round.',
    actions: [
      { title: 'Set up an exclusion zone with a banksman at doors 1 to 4', owner: 'ravi', after: 0.05, dueDays: 2, doneDays: 0.8, verification: 'Barrier tape and a banksman on every loading until the barrier is in.' },
      { title: 'Install a pedestrian barrier and a signal-controlled crossing at doors 1 to 4', owner: 'lee', after: 0.05, dueDays: 13, doneDays: 12, verification: 'Barrier installed, crossing light wired to the dock doors; walked through with both shifts.' },
    ] },
  { site: 'north', zone: 'dock', ago: 44, kind: 'unsafe_act', category: 'vehicles_pedestrians', potential: 'high', status: 'fixed', who: 'anon', area: DOCK_CROSSING, fixAgo: BARRIER_DONE_AGO,
    text: 'The tape for the temporary exclusion zone gets pushed aside to save walking round.' },
  { site: 'north', zone: 'dock', ago: 20, kind: 'good_catch', category: 'vehicles_pedestrians', potential: 'low', status: 'closed', who: 'ravi', area: DOCK_CROSSING,
    text: 'A driver stopped at the new crossing light even with the lane empty. The habit is forming.' },
  { site: 'north', zone: 'dock', ago: 9, kind: 'unsafe_condition', category: 'vehicles_pedestrians', potential: 'low', status: 'action_assigned', who: 'lee', area: DOCK_CROSSING,
    text: 'The new barrier at door 4 has been scuffed by a forklift and one post is loose.',
    actions: [{ title: 'Re-fix the loose barrier post at door 4', owner: 'lee' }] },

  /* ---------------- Northgate: everywhere else ---------------- */
  { site: 'north', zone: 'rackA', ago: 78, kind: 'unsafe_condition', category: 'working_at_height', potential: 'medium', status: 'closed', who: 'lee',
    text: 'Beam lock pin missing on bay A12, level 3.',
    actions: [{ title: 'Replace missing beam locks across aisles A to D', owner: 'lee', doneDays: 6, verification: 'Aisles A to D checked; 9 pins replaced.' }] },
  { site: 'north', zone: 'rackA', ago: 40, kind: 'near_miss', category: 'working_at_height', potential: 'high', status: 'closed', who: 'anon',
    text: 'A carton fell from the top level in aisle C while a picker was below.',
    actions: [{ title: 'Fit anti-collapse mesh to the top levels of aisle C', owner: 'lee', doneDays: 11, verification: 'Mesh fitted to all top levels in aisle C.' }] },
  { site: 'north', zone: 'rackA', ago: 12, kind: 'unsafe_act', category: 'working_at_height', potential: 'medium', status: 'action_assigned', who: 'sam',
    text: 'Someone climbed the racking to reach a carton instead of fetching the order picker.',
    actions: [{ title: 'Toolbox talk on access equipment for aisles A to D', owner: 'ravi' }] },
  { site: 'north', zone: 'rackB', ago: 26, kind: 'near_miss', category: 'working_at_height', potential: 'high', status: 'action_assigned', who: 'anon',
    text: 'A pallet overhanging the beam at E-14 level 4 tipped when the next pallet went in.',
    actions: [{ title: 'Re-train reach truck drivers on pallet placement', owner: 'ravi' }] },
  { site: 'north', zone: 'rackB', ago: 18, kind: 'unsafe_condition', category: 'working_at_height', potential: 'high', status: 'triaged', who: 'ravi',
    text: 'Upright at F-08 is dented about 30 mm and the bay has not been offloaded.' },
  { site: 'north', zone: 'rackB', ago: 9, kind: 'near_miss', category: 'working_at_height', potential: 'serious', status: 'action_assigned', who: 'anon', triageH: 2,
    text: 'A reach truck lifted a pallet into G-21 with a colleague still in the aisle below.',
    actions: [{ title: 'Add aisle-entry gates to aisles E to H', owner: 'lee' }] },
  { site: 'north', zone: 'rackB', ago: 4, kind: 'unsafe_condition', category: 'slips_trips_falls', potential: 'medium', status: 'triaged', who: 'sam',
    text: 'Shrink-wrap offcuts left in aisle H get tangled round the order picker wheels.' },
  { site: 'north', zone: 'rackB', ago: 1.5, kind: 'unsafe_condition', category: 'working_at_height', potential: 'medium', status: 'new', who: 'lee',
    text: 'The safe working load signs are missing on aisle E, so people guess what a bay can hold.' },
  { site: 'north', zone: 'route', ago: 66, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'medium', status: 'closed', who: 'priya',
    text: 'A forklift came round the canteen corner too fast. The speed limit sign is hidden behind a pallet.',
    actions: [{ title: 'Move the speed sign and paint the limit on the floor', owner: 'lee', doneDays: 8, verification: 'Floor marking at both corners.' }] },
  { site: 'north', zone: 'route', ago: 30, kind: 'unsafe_condition', category: 'vehicles_pedestrians', potential: 'low', status: 'closed', who: 'anon',
    text: 'Floor paint on the forklift route has worn through near pick and pack.' },
  { site: 'north', zone: 'route', ago: 2.4, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'medium', status: 'triaged', who: 'anon',
    text: 'Two forklifts passed in the narrow section by battery charging with no room left for the walkway.' },
  { site: 'north', zone: 'pick', ago: 72, kind: 'unsafe_act', category: 'manual_handling', potential: 'medium', status: 'closed', who: 'ravi',
    text: 'Heavy cases of water are being lifted from floor level without the lift assist.',
    actions: [{ title: 'Move heavy lines to waist-height locations', owner: 'ravi', doneDays: 10, verification: 'Top 20 heavy lines re-slotted to waist height.' }] },
  { site: 'north', zone: 'pick', ago: 35, kind: 'near_miss', category: 'manual_handling', potential: 'low', status: 'closed', who: 'sam',
    text: 'A tote stack toppled off the end of the conveyor and just missed a packer’s feet.' },
  { site: 'north', zone: 'pick', ago: 6, kind: 'unsafe_condition', category: 'slips_trips_falls', potential: 'low', status: 'triaged', who: 'anon',
    text: 'Empty tape rolls and cores left on the floor by packing bench 4.' },
  { site: 'north', zone: 'pick', ago: 0.8, kind: 'unsafe_condition', category: 'electrical', potential: 'medium', status: 'new', who: 'sam',
    text: 'The label printer cable at bench 2 is split at the plug.', did: 'Unplugged it and put a note on it.' },
  { site: 'north', zone: 'battery', ago: 57, kind: 'unsafe_condition', category: 'chemicals', potential: 'high', status: 'closed', who: 'lee',
    text: 'The eye-wash station at battery charging is empty.',
    actions: [{ title: 'Refill the eye-wash and add it to the weekly check', owner: 'lee', doneDays: 1, verification: 'Refilled; on the weekly checklist from now on.' }] },
  { site: 'north', zone: 'battery', ago: 22, kind: 'near_miss', category: 'electrical', potential: 'high', status: 'action_assigned', who: 'anon',
    text: 'A charger lead arced when a truck pulled away still plugged in.',
    actions: [{ title: 'Fit drive-away interlocks to chargers 1 to 4', owner: 'lee' }] },
  { site: 'north', zone: 'battery', ago: 3, kind: 'good_catch', category: 'fire', potential: 'low', status: 'closed', who: 'ravi',
    text: 'Spotted a charger fan stopped and a battery running hot. Isolated it and called maintenance.' },
  { site: 'north', zone: 'welfare', ago: 45, kind: 'unsafe_condition', category: 'slips_trips_falls', potential: 'medium', status: 'closed', who: 'anon',
    text: 'Water on the canteen floor by the drinks machine and no wet floor sign out.',
    actions: [{ title: 'Fit a drip tray and keep a sign by the drinks machine', owner: 'ravi', doneDays: 2, verification: 'Drip tray fitted.' }] },
  { site: 'north', zone: 'welfare', ago: 11, kind: 'good_catch', category: 'fire', potential: 'low', status: 'closed', who: 'priya',
    text: 'Found a fire door wedged open with a chair at the locker room and closed it.' },
  { site: 'north', zone: 'office', ago: 38, kind: 'unsafe_condition', category: 'fire', potential: 'medium', status: 'closed', who: 'ana',
    text: 'Boxes stored in front of the fire exit by the training room.',
    actions: [{ title: 'Clear the fire exit and mark a no-storage zone', owner: 'priya', doneDays: 1, verification: 'Cleared and hatched.' }] },
  { site: 'north', zone: 'office', ago: 5, kind: 'good_catch', category: 'electrical', potential: 'low', status: 'closed', who: 'ana',
    text: 'Noticed an overloaded extension lead under the desks and split the load over two sockets.' },
  { site: 'north', zone: 'carpark', ago: 50, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'medium', status: 'closed', who: 'anon',
    text: 'A car reversed out of a bay as someone walked to the entrance. There is no pedestrian path.',
    actions: [{ title: 'Paint a pedestrian path along the car park', owner: 'lee', doneDays: 20, verification: 'Path painted once the weather allowed.' }] },
  { site: 'north', zone: 'carpark', ago: 15, kind: 'unsafe_condition', category: 'slips_trips_falls', potential: 'low', status: 'fixed', who: 'sam',
    text: 'Pothole by the smoking shelter, full of water and hard to see.',
    actions: [{ title: 'Fill the pothole by the smoking shelter', owner: 'lee', doneDays: 4, verification: 'Filled and levelled.' }] },
  { site: 'north', zone: 'despatch', ago: 0.29, kind: 'near_miss', category: 'machinery_guarding', potential: 'serious', status: 'new', who: 'anon',
    text: 'The dock leveller lip dropped while a pallet truck was on it at door 12. The operator jumped clear.' },
  { site: 'north', zone: 'despatch', ago: 33, kind: 'unsafe_condition', category: 'vehicles_pedestrians', potential: 'medium', status: 'closed', who: 'priya',
    text: 'Trailer creep at door 12, and there are no wheel chocks in the rack.',
    actions: [{ title: 'Fit a wheel chock stand at each despatch door', owner: 'lee', doneDays: 5, verification: 'Stands fitted at doors 10 to 14.' }] },
  { site: 'north', zone: 'despatch', ago: 16, kind: 'unsafe_act', category: 'manual_handling', potential: 'medium', status: 'action_assigned', who: 'anon',
    text: 'Roll cages are being pulled two at a time down the ramp.',
    actions: [{ title: 'One cage at a time: brief despatch and add a ramp sign', owner: 'ravi' }] },
  { site: 'north', zone: 'marsh', ago: 62, kind: 'unsafe_condition', category: 'slips_trips_falls', potential: 'low', status: 'closed', who: 'ravi',
    text: 'Broken pallet boards left lying in the marshalling lanes.' },
  { site: 'north', zone: 'marsh', ago: 27, kind: 'near_miss', category: 'manual_handling', potential: 'medium', status: 'closed', who: 'sam',
    text: 'A stretch-wrap roll fell off the wrapping machine arm onto the lane.',
    actions: [{ title: 'Repair the wrap arm clamp', owner: 'lee', doneDays: 2, verification: 'Clamp replaced.' }] },
  { site: 'north', zone: 'marsh', ago: 1.25, kind: 'unsafe_condition', category: 'fire', potential: 'low', status: 'new', who: 'anon',
    text: 'The fire extinguisher at the marshalling exit has no pin or inspection tag.' },
  { site: 'north', zone: 'yard', ago: 42, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'high', status: 'closed', who: 'anon',
    text: 'An HGV driver walked across the yard during a shunt, looking for the office.',
    actions: [{ title: 'Mark a drivers’ route from the gate to the office', owner: 'priya', doneDays: 6, verification: 'Route painted and signed.' }] },
  { site: 'north', zone: 'yard', ago: 8, kind: 'unsafe_condition', category: 'other', potential: 'low', status: 'triaged', who: 'lee',
    text: 'The yard floodlight by gate 2 is out, so the gate is dark from 5 pm.' },

  /* ---------------- Eastside Plant ---------------- */
  { site: 'east', zone: 'paint', ago: 28, kind: 'near_miss', category: 'chemicals', potential: 'high', status: 'action_assigned', who: 'anon',
    text: 'A solvent drum was left open next to the paint booth extract.',
    actions: [{ title: 'Fit self-closing lids to all solvent drums', owner: 'mia' }] },
  { site: 'east', zone: 'paint', ago: 14, kind: 'unsafe_condition', category: 'chemicals', potential: 'medium', status: 'fixed', who: 'tom',
    text: 'The extract fan on booth 2 is running slow and there are fumes in the mixing room.',
    actions: [{ title: 'Service the booth 2 extract fan', owner: 'mia', doneDays: 3, verification: 'Belt replaced; airflow tested at 0.5 m/s.' }] },
  { site: 'east', zone: 'paint', ago: 6, kind: 'unsafe_act', category: 'chemicals', potential: 'medium', status: 'triaged', who: 'anon',
    text: 'Thinners being decanted without goggles at the mixing bench.' },
  { site: 'east', zone: 'paint', ago: 0.1, kind: 'near_miss', category: 'fire', potential: 'high', status: 'new', who: 'anon',
    text: 'A spark from the grinder in the next bay landed by the paint booth waste bin.' },
  { site: 'east', zone: 'press', ago: 80, kind: 'near_miss', category: 'machinery_guarding', potential: 'serious', status: 'closed', who: 'anon',
    text: 'The press 3 light guard was muted for a tool change and not reset. The operator’s hand was near the tool.',
    actions: [{ title: 'Key-lock the light guard mute on press 3', owner: 'mia', doneDays: 2, verification: 'Mute now needs the setter’s key; checked by the supervisor.' }] },
  { site: 'east', zone: 'press', ago: 36, kind: 'unsafe_condition', category: 'machinery_guarding', potential: 'high', status: 'action_assigned', who: 'lee',
    text: 'The interlock on the press 5 rear gate can be bypassed with a cable tie.',
    actions: [{ title: 'Replace the press 5 rear gate interlock with a coded switch', owner: 'mia' }] },
  { site: 'east', zone: 'press', ago: 20, kind: 'unsafe_act', category: 'manual_handling', potential: 'medium', status: 'closed', who: 'tom',
    text: 'Tools being changed by hand above shoulder height because the hoist is out of service.',
    actions: [{ title: 'Repair the press shop tool hoist', owner: 'mia', doneDays: 17, verification: 'Hoist repaired and load tested.' }] },
  { site: 'east', zone: 'assembly', ago: 58, kind: 'near_miss', category: 'manual_handling', potential: 'medium', status: 'closed', who: 'anon',
    text: 'A sub-frame slipped off the lift assist hook during assembly.',
    actions: [{ title: 'Replace the lift assist hook with a safety-latch hook', owner: 'mia', doneDays: 4, verification: 'Latch hooks on all four lift assists.' }] },
  { site: 'east', zone: 'assembly', ago: 10, kind: 'unsafe_condition', category: 'slips_trips_falls', potential: 'low', status: 'triaged', who: 'anon',
    text: 'Air hoses trailing across the walkway at station 6.' },
  { site: 'east', zone: 'assembly', ago: 1.6, kind: 'unsafe_condition', category: 'electrical', potential: 'medium', status: 'new', who: 'anon',
    text: 'A torque tool charger has been left on a wet bench at station 2.' },
  { site: 'east', zone: 'chem', ago: 47, kind: 'unsafe_condition', category: 'chemicals', potential: 'high', status: 'closed', who: 'mia',
    text: 'Acid and caustic are stored on the same shelf in the chemical store.',
    actions: [{ title: 'Segregate acids and alkalis on bunded shelving', owner: 'mia', doneDays: 12, verification: 'Separate bunded bays, labelled.' }] },
  { site: 'east', zone: 'comp', ago: 24, kind: 'good_catch', category: 'other', potential: 'low', status: 'closed', who: 'mia',
    text: 'Heard a pressure relief valve chattering and isolated the compressor before it failed.' },
  { site: 'east', zone: 'maint', ago: 32, kind: 'unsafe_act', category: 'electrical', potential: 'high', status: 'closed', who: 'anon',
    text: 'A panel was opened without isolation to trace a fault.',
    actions: [{ title: 'Re-brief lock-out tag-out and audit it monthly', owner: 'tom', doneDays: 3, verification: 'Briefed; first audit done, no findings.' }] },
  { site: 'east', zone: 'aisle', ago: 12, kind: 'near_miss', category: 'vehicles_pedestrians', potential: 'medium', status: 'action_assigned', who: 'tom',
    text: 'A tow tractor and a pedestrian met at the paint line corner. There is no mirror.',
    actions: [{ title: 'Fit a convex mirror at the paint line corner', owner: 'mia' }] },
  { site: 'east', zone: 'crib', ago: 64, kind: 'unsafe_condition', category: 'slips_trips_falls', potential: 'low', status: 'closed', who: 'anon',
    text: 'Oil on the floor in front of the tool crib counter.',
    actions: [{ title: 'Add a drip tray under the oil dispenser', owner: 'mia', doneDays: 3, verification: 'Tray fitted.' }] },
  { site: 'east', zone: 'canteen', ago: 4, kind: 'good_catch', category: 'fire', potential: 'low', status: 'closed', who: 'tom',
    text: 'The toaster crumb tray was full and smoking. Emptied it and unplugged the toaster.' },

  /* ---------------- Harbour Office ---------------- */
  { site: 'harbour', zone: 'openplan', ago: 70, kind: 'unsafe_condition', category: 'slips_trips_falls', potential: 'low', status: 'closed', who: 'ana',
    text: 'A carpet tile has lifted by the window desks.' },
  { site: 'harbour', zone: 'openplan', ago: 19, kind: 'unsafe_condition', category: 'electrical', potential: 'medium', status: 'action_assigned', who: 'anon',
    text: 'Extension leads are daisy-chained under the hot desks in row C.',
    actions: [{ title: 'Install floor boxes under row C', owner: 'dana' }] },
  { site: 'harbour', zone: 'kitchen', ago: 44, kind: 'near_miss', category: 'slips_trips_falls', potential: 'medium', status: 'closed', who: 'anon',
    text: 'Slipped on water by the dishwasher and caught the counter.',
    actions: [{ title: 'Fit an absorbent mat by the dishwasher', owner: 'ana', doneDays: 1, verification: 'Mat in place.' }] },
  { site: 'harbour', zone: 'kitchen', ago: 3, kind: 'unsafe_condition', category: 'fire', potential: 'medium', status: 'triaged', who: 'dana',
    text: 'The microwave door seal is damaged and it sparks.' },
  { site: 'harbour', zone: 'server', ago: 25, kind: 'unsafe_condition', category: 'fire', potential: 'high', status: 'fixed', who: 'anon',
    text: 'The server room door is propped open, so the gas suppression would not work.',
    actions: [{ title: 'Fit a door closer and an open-door alarm to the server room', owner: 'ana', doneDays: 6, verification: 'Closer and alarm fitted.' }] },
  { site: 'harbour', zone: 'stair', ago: 53, kind: 'near_miss', category: 'slips_trips_falls', potential: 'high', status: 'closed', who: 'ana',
    text: 'Missed the bottom step in the stairwell because the timer light cut out.',
    actions: [{ title: 'Replace the stairwell timer with motion sensors', owner: 'ana', doneDays: 5, verification: 'Sensors on every landing.' }] },
  { site: 'harbour', zone: 'bike', ago: 30, kind: 'unsafe_condition', category: 'other', potential: 'low', status: 'closed', who: 'anon',
    text: 'The bike rack bolts are loose and a rack fell over.',
    actions: [{ title: 'Re-fix the bike racks', owner: 'ana', doneDays: 2, verification: 'Re-bolted.' }] },
  { site: 'harbour', zone: 'archive', ago: 8, kind: 'unsafe_act', category: 'manual_handling', potential: 'medium', status: 'triaged', who: 'anon',
    text: 'Archive boxes being lifted to the top shelf while standing on a chair.' },
  { site: 'harbour', zone: 'print', ago: 1.1, kind: 'unsafe_condition', category: 'manual_handling', potential: 'low', status: 'new', who: 'ana',
    text: 'The paper delivery has been left stacked in the corridor outside the print room.' },
  { site: 'harbour', zone: 'meeting', ago: 0.5, kind: 'unsafe_condition', category: 'slips_trips_falls', potential: 'low', status: 'new', who: 'anon',
    text: 'The projector cable runs across the floor in meeting room 3.' },
];

/** Deterministic 0–1 from a string (FNV-1a), so pins land in the same place on every seed. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export async function seed(store: DataStore<Schema>, ctx: SeedContext): Promise<void> {
  const now = ctx.now.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();

  // People: personas first (from ctx), then the extra action owners.
  const people = new Map<Who, Person>();
  const [dana, priya, tom, sam] = ctx.people;
  people.set('dana', dana).set('priya', priya).set('tom', tom).set('sam', sam);
  for (const [who, name, sub] of EXTRA_PEOPLE) {
    const existing = (await store.repo('Person').list({ where: { sub } }))[0];
    const p =
      existing ??
      (await store.repo('Person').create({ sub, displayName: name, email: null, isAdmin: false, createdAt: iso(now - 120 * DAY) }));
    people.set(who, p);
  }
  const person = (w: Who) => people.get(w)!;

  // Sites and zones.
  const siteIds = new Map<string, string>();
  const zoneRows = new Map<string, { id: string; x: number; y: number; w: number; h: number }>();
  for (const s of SITES) {
    const sup = person(s.supervisor);
    const site = await store.repo('Site').create({ name: s.name, kind: s.kind, supervisorSub: sup.sub, supervisorName: sup.displayName });
    siteIds.set(s.key, site.id);
    for (const [key, name, kind, x, y, w, h] of s.zones) {
      const z = await store.repo('Zone').create({ siteId: site.id, name, kind, x, y, w, h });
      zoneRows.set(`${s.key}.${key}`, { id: z.id, x, y, w, h });
    }
  }

  // Reports and their actions.
  for (const [i, s] of REPORTS.entries()) {
    const zone = zoneRows.get(`${s.site}.${s.zone}`)!;
    const supervisor = person(SITES.find((x) => x.key === s.site)!.supervisor);
    const reportedAt = now - s.ago * DAY;
    const [ax, ay, aw, ah] = s.area ?? [zone.x + 2, zone.y + 2, Math.max(1, zone.w - 4), Math.max(1, zone.h - 4)];
    const x = Math.round(ax + hash01(`${i}x${s.text}`) * aw);
    const y = Math.round(ay + hash01(`${i}y${s.text}`) * ah);
    const triaged = s.status !== 'new';
    const triagedAt = triaged ? reportedAt + (s.triageH ?? 3) * HOUR : null;

    // Actions first (their dates decide when the report was fixed).
    const actionRows = (s.actions ?? []).map((a) => {
      const createdAt = (triagedAt ?? reportedAt) + (a.after ?? 0.1) * DAY;
      const dueAt = createdAt + (a.dueDays ?? ACTION_DUE_DAYS[s.potential]) * DAY;
      const doneAt = a.doneDays !== undefined ? createdAt + a.doneDays * DAY : null;
      return { a, createdAt, dueAt, doneAt };
    });
    let fixedAt: number | null = null;
    if (s.status === 'fixed' || s.status === 'closed') {
      fixedAt = actionRows.length
        ? Math.max(...actionRows.map((r) => r.doneAt ?? r.createdAt))
        : s.fixAgo !== undefined
          ? now - s.fixAgo * DAY
          : (triagedAt ?? reportedAt) + 2 * DAY;
    }
    const closedAt = s.status === 'closed' && fixedAt !== null ? Math.min(now - HOUR, fixedAt + 1.5 * DAY) : null;
    const reporter = s.who === 'anon' ? null : person(s.who);

    const row: Omit<Report, 'id'> = {
      siteId: siteIds.get(s.site)!,
      zoneId: zone.id,
      kind: s.kind,
      category: s.category,
      potential: s.potential,
      description: s.text,
      immediateAction: s.did ?? null,
      anonymous: reporter === null,
      reporterSub: reporter?.sub ?? null,
      reporterName: reporter?.displayName ?? null,
      reportedAt: iso(reportedAt),
      status: s.status,
      triagedBy: triaged ? supervisor.sub : null,
      triagedByName: triaged ? supervisor.displayName : null,
      triagedAt: triagedAt === null ? null : iso(triagedAt),
      fixedAt: fixedAt === null ? null : iso(fixedAt),
      closedAt: closedAt === null ? null : iso(closedAt),
      x,
      y,
    };
    const report = await store.repo('Report').create(row);
    for (const { a, createdAt, dueAt, doneAt } of actionRows) {
      const owner = person(a.owner);
      await store.repo('Action').create({
        reportId: report.id,
        siteId: report.siteId,
        title: a.title,
        ownerSub: owner.sub,
        ownerName: owner.displayName,
        dueAt: iso(dueAt),
        status: doneAt === null ? 'open' : 'done',
        doneAt: doneAt === null ? null : iso(doneAt),
        verification: doneAt === null ? null : (a.verification ?? null),
        createdBySub: supervisor.sub,
        createdAt: iso(createdAt),
      });
    }
  }
}
