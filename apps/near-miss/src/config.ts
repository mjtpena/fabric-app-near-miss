/**
 * Rules, thresholds and wording a safety team may want to tune. Plain data, no React: the About page, the domain
 * functions and the tests all read from here.
 */
import type { Category, Potential, ReportKind, ReportStatus, SiteKind, ZoneKind } from './model';

/** Every report is triaged within this many hours of being reported. */
export const TRIAGE_HOURS = 24;
/** High and serious potential reports are triaged within this many hours. */
export const URGENT_TRIAGE_HOURS = 4;
/** Potentials that use the urgent triage clock. */
export const URGENT_POTENTIALS: Potential[] = ['high', 'serious'];

/** Default action due date, in days from assignment, by the report's potential. */
export const ACTION_DUE_DAYS: Record<Potential, number> = { serious: 2, high: 7, medium: 14, low: 30 };

/** Hotspot weights: a zone's score is the weighted count of its reports over the hotspot window. */
export const HOTSPOT_WEIGHTS: Record<Potential, number> = { serious: 8, high: 4, medium: 2, low: 1 };
export const HOTSPOT_WINDOW_DAYS = 90;
/** "Hottest zone this month" in Today uses this shorter window. */
export const HOT_MONTH_DAYS = 30;

/**
 * Live heat on the plan and the time slider: each report adds its hotspot weight, fading with age (it halves every
 * HEAT_HALF_LIFE_DAYS) and dropping to FIXED_HEAT_FACTOR of its weight once it is fixed. So a hotspot forms as
 * reports arrive and cools after the fix.
 */
export const HEAT_HALF_LIFE_DAYS = 14;
export const FIXED_HEAT_FACTOR = 0.2;

/** Good catches reported in the last this-many days show in Today as "to thank". */
export const THANK_DAYS = 14;

/** Age lens buckets (days since reported). */
export const AGE_BUCKETS = [
  { key: 'week', label: 'This week', maxDays: 7 },
  { key: 'month', label: '1–4 weeks', maxDays: 30 },
  { key: 'quarter', label: '1–2 months', maxDays: 60 },
  { key: 'old', label: '2–3 months', maxDays: Infinity },
] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number]['key'];

export const kindLabels: Record<ReportKind, string> = {
  near_miss: 'Near miss',
  unsafe_condition: 'Unsafe condition',
  unsafe_act: 'Unsafe act',
  good_catch: 'Good catch',
};

export const kindHelp: Record<ReportKind, string> = {
  near_miss: 'Something happened that could have hurt someone, but did not',
  unsafe_condition: 'Something on site that could hurt someone',
  unsafe_act: 'Someone doing something in a way that could hurt them or others',
  good_catch: 'Someone spotted and stopped a hazard before it hurt anyone',
};

export const categoryLabels: Record<Category, string> = {
  slips_trips_falls: 'Slips, trips, falls',
  working_at_height: 'Working at height',
  vehicles_pedestrians: 'Vehicles and pedestrians',
  manual_handling: 'Manual handling',
  electrical: 'Electrical',
  chemicals: 'Chemicals',
  machinery_guarding: 'Machinery guarding',
  fire: 'Fire',
  other: 'Other',
};

/** Short labels for chips on a phone. */
export const categoryShort: Record<Category, string> = {
  slips_trips_falls: 'Slip or trip',
  working_at_height: 'Height',
  vehicles_pedestrians: 'Vehicles',
  manual_handling: 'Lifting',
  electrical: 'Electrical',
  chemicals: 'Chemicals',
  machinery_guarding: 'Machinery',
  fire: 'Fire',
  other: 'Other',
};

export const potentialLabels: Record<Potential, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  serious: 'Serious',
};

export const potentialHelp: Record<Potential, string> = {
  low: 'A minor injury at worst',
  medium: 'An injury needing first aid or a day off',
  high: 'A serious injury',
  serious: 'A life-changing injury or a death',
};

export const statusLabels: Record<ReportStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  action_assigned: 'Action assigned',
  fixed: 'Fixed',
  closed: 'Closed',
};

export const siteKindLabels: Record<SiteKind, string> = {
  warehouse: 'Warehouse',
  plant: 'Plant',
  office: 'Office',
  construction: 'Construction site',
  retail: 'Retail',
};

export const zoneKindLabels: Record<ZoneKind, string> = {
  room: 'Room',
  yard: 'Yard',
  dock: 'Dock',
  store: 'Racking and storage',
  route: 'Vehicle route',
  plant: 'Plant and machinery',
  office: 'Office',
  welfare: 'Welfare',
};

/** Toolbox talk prompts per category: what to say to the team, in plain words. */
export const talkingPoints: Record<Category, string[]> = {
  slips_trips_falls: [
    'Report spills and loose cables the moment you see them; do not wait for the end of the shift.',
    'Keep walkways clear: nothing parked or stacked on the yellow lines.',
  ],
  working_at_height: [
    'Use the platform or the step ladder, never the racking or a pallet on the forks.',
    'Check the guard rail and gate before you go up, every time.',
  ],
  vehicles_pedestrians: [
    'Walk only on the marked routes and cross at the crossing; make eye contact with the driver.',
    'Drivers: horn at the blind corners, and stop when anyone is inside the exclusion zone.',
  ],
  manual_handling: [
    'Use the trolley or the lift assist for anything over the marked weight.',
    'Ask for a two-person lift; it is not a weakness, it is the procedure.',
  ],
  electrical: [
    'Do not use equipment with a damaged cable or plug; tag it and report it.',
    'Only trained people open panels or reset trips.',
  ],
  chemicals: [
    'Read the label and the safety sheet before decanting anything.',
    'Gloves and goggles on, and spill kit within reach.',
  ],
  machinery_guarding: [
    'Never reach past a guard; isolate and lock off before clearing a jam.',
    'A missing or loose guard stops the machine until it is fixed.',
  ],
  fire: [
    'Keep fire doors shut and exits clear; nothing stored in front of them.',
    'Know your assembly point and the nearest call point.',
  ],
  other: ['If it looks wrong, report it: thirty seconds now can save a long recovery later.'],
};
