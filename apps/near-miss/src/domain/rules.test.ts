import { DAY, HOUR } from '@x10/shared/lib';

import { ACTION_DUE_DAYS, TRIAGE_HOURS, URGENT_TRIAGE_HOURS } from '../config';
import type { Report } from '../model';
import {
  actionState,
  ANONYMOUS_CANNOT_EDIT,
  checkEdit,
  checkTransition,
  defaultDueAt,
  defaultDueDays,
  isTriageLate,
  nextStatuses,
  SERIOUS_NEEDS_ACTION,
  triageClock,
  triageDeadline,
  triageLimitHours,
} from './rules';

const T0 = new Date('2026-11-20T09:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

function report(p: Partial<Report> = {}): Report {
  return {
    id: 'r1',
    siteId: 's1',
    zoneId: 'z1',
    kind: 'near_miss',
    category: 'vehicles_pedestrians',
    potential: 'medium',
    description: 'A forklift nearly hit someone.',
    immediateAction: null,
    anonymous: false,
    reporterSub: 'u1',
    reporterName: 'Una',
    reportedAt: T0.toISOString(),
    status: 'new',
    triagedBy: null,
    triagedByName: null,
    triagedAt: null,
    fixedAt: null,
    closedAt: null,
    x: 10,
    y: 10,
    ...p,
  };
}

describe('triage clock (rule 1)', () => {
  it('uses 24 h for low and medium, 4 h for high and serious', () => {
    expect(TRIAGE_HOURS).toBe(24);
    expect(URGENT_TRIAGE_HOURS).toBe(4);
    expect(triageLimitHours('low')).toBe(24);
    expect(triageLimitHours('medium')).toBe(24);
    expect(triageLimitHours('high')).toBe(4);
    expect(triageLimitHours('serious')).toBe(4);
    expect(triageDeadline(report({ potential: 'serious' }))).toBe(at(4 * HOUR).toISOString());
    expect(triageDeadline(report({ potential: 'low' }))).toBe(at(24 * HOUR).toISOString());
  });

  it('is waiting until the deadline, inclusive, and late one millisecond after', () => {
    const r = report({ potential: 'high' });
    expect(triageClock(r, at(4 * HOUR)).state).toBe('waiting');
    expect(triageClock(r, at(4 * HOUR)).marginMs).toBe(0);
    expect(triageClock(r, at(4 * HOUR + 1)).state).toBe('late');
    expect(isTriageLate(r, at(5 * HOUR))).toBe(true);
    expect(isTriageLate(report(), at(5 * HOUR))).toBe(false);
  });

  it('a triaged report records whether it was triaged on time, whatever the time now', () => {
    const onTime = report({ potential: 'serious', status: 'triaged', triagedAt: at(3 * HOUR).toISOString() });
    expect(triageClock(onTime, at(30 * DAY)).state).toBe('on_time');
    const late = report({ potential: 'serious', status: 'triaged', triagedAt: at(6 * HOUR).toISOString() });
    expect(triageClock(late, at(30 * DAY))).toMatchObject({ state: 'triaged_late', marginMs: -2 * HOUR });
    expect(isTriageLate(late, at(30 * DAY))).toBe(false);
  });
});

describe('transitions (rule 2)', () => {
  const none: { status: 'open' | 'done' }[] = [];
  it('a serious report cannot move past triaged without an action', () => {
    const r = report({ potential: 'serious', status: 'triaged' });
    expect(checkTransition(r, 'fixed', none)).toBe(SERIOUS_NEEDS_ACTION);
    expect(checkTransition(r, 'closed', none)).toBe(SERIOUS_NEEDS_ACTION);
    expect(checkTransition(r, 'action_assigned', none)).toBe(SERIOUS_NEEDS_ACTION);
    expect(checkTransition(r, 'fixed', [{ status: 'done' }])).toBeNull();
  });

  it('other potentials may go straight from triaged to fixed or closed', () => {
    for (const potential of ['low', 'medium', 'high'] as const) {
      const r = report({ potential, status: 'triaged' });
      expect(checkTransition(r, 'fixed', none)).toBeNull();
      expect(checkTransition(r, 'closed', none)).toBeNull();
    }
  });

  it('new reports must be triaged first; triage itself is always allowed', () => {
    const r = report({ potential: 'serious' });
    expect(checkTransition(r, 'triaged', none)).toBeNull();
    expect(checkTransition(r, 'fixed', [{ status: 'done' }])).toBe('Triage the report first.');
    expect(checkTransition(r, 'action_assigned', [{ status: 'open' }])).toBeNull();
  });

  it('open actions block fixed and closed; no going backwards; closed is final', () => {
    const r = report({ status: 'action_assigned' });
    expect(checkTransition(r, 'fixed', [{ status: 'open' }, { status: 'done' }])).toBe('Finish the open action first.');
    expect(checkTransition(r, 'fixed', [{ status: 'open' }, { status: 'open' }])).toBe('Finish the open 2 actions first.');
    expect(checkTransition(r, 'closed', [{ status: 'done' }])).toBe('Mark it fixed before closing it.');
    expect(checkTransition(report({ status: 'fixed' }), 'triaged', none)).toMatch(/cannot go back/);
    expect(checkTransition(report({ status: 'closed' }), 'fixed', none)).toBe('This report is closed.');
    expect(checkTransition(report({ status: 'triaged' }), 'new', none)).toBe('A report cannot go back to new.');
    expect(checkTransition(report({ status: 'triaged' }), 'triaged', none)).toMatch(/already triaged/);
  });

  it('lists the next statuses for the buttons', () => {
    expect(nextStatuses('new')).toEqual(['triaged']);
    expect(nextStatuses('triaged')).toEqual(['fixed', 'closed']);
    expect(nextStatuses('closed')).toEqual([]);
  });
});

describe('action due dates (rule 3) and overdue', () => {
  it('defaults by potential: serious 2, high 7, medium 14, low 30 days', () => {
    expect(ACTION_DUE_DAYS).toEqual({ serious: 2, high: 7, medium: 14, low: 30 });
    expect(defaultDueDays('serious')).toBe(2);
    expect(defaultDueAt('high', T0)).toBe(at(7 * DAY).toISOString());
    expect(defaultDueAt('low', T0)).toBe(at(30 * DAY).toISOString());
  });

  it('overdue is computed: open and past due; done is on time or late', () => {
    const due = at(DAY).toISOString();
    expect(actionState({ status: 'open', dueAt: due, doneAt: null }, at(DAY))).toBe('open');
    expect(actionState({ status: 'open', dueAt: due, doneAt: null }, at(DAY + 1))).toBe('overdue');
    expect(actionState({ status: 'done', dueAt: due, doneAt: at(DAY).toISOString() }, at(9 * DAY))).toBe('done');
    expect(actionState({ status: 'done', dueAt: due, doneAt: at(2 * DAY).toISOString() }, at(9 * DAY))).toBe('done_late');
  });
});

describe('editing', () => {
  it('anonymous reports can never be edited, even by the person who filed them', () => {
    expect(checkEdit(report({ anonymous: true, reporterSub: null, reporterName: null }), 'u1')).toBe(ANONYMOUS_CANNOT_EDIT);
  });
  it('named reports: only the reporter, only while new', () => {
    expect(checkEdit(report(), 'u1')).toBeNull();
    expect(checkEdit(report(), 'someone-else')).toMatch(/Only the person/);
    expect(checkEdit(report({ status: 'triaged' }), 'u1')).toMatch(/until it is triaged/);
  });
});
