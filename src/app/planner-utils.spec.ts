import { describe, expect, it } from 'vitest';
import { PlannerPerson, Training } from './planner.models';
import { absenceOverlaps, defaultPresence, effectivePeriod, parsePlannerCsv, visibleTrainingDates } from './planner-utils';

const person: PlannerPerson = {
  id: 'p1', firstName: 'Arti', lastName: 'Muster', gender: 'Männlich', role: 'Teilnehmer', subTrainingId: 'glk', external: false, expert: false, archived: false
};

const training: Training = {
  id: 't1', name: 'GTQ 2026-2', startDate: '2026-09-06', endDate: '2026-09-12', mainInstructor: 'Mia Berg',
  subTrainings: [{ id: 'glk', name: 'GLK', instructors: ['Mia Berg'] }], people: [person], presence: {}, absences: [],
  createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T00:00:00Z'
};

describe('planner calculations', () => {
  it('shows the preparation day and official training days', () => {
    expect(visibleTrainingDates(training)).toEqual([
      '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'
    ]);
  });

  it('defaults participants to present during the event but not on the preparation day', () => {
    expect(defaultPresence(training, person, '2026-09-05').dinner).toBe(false);
    expect(defaultPresence(training, person, '2026-09-06').morning).toBe(true);
    expect(defaultPresence(training, person, '2026-09-12').overnight).toBe(false);
  });

  it('defaults event staff to dinner and overnight on the preparation day', () => {
    const leader = { ...person, role: 'Event Leiter' as const };
    expect(defaultPresence(training, leader, '2026-09-05')).toMatchObject({ morning: false, dinner: true, overnight: true });
  });

  it('applies approved absences without destroying the planned presence', () => {
    const withAbsence = {
      ...training,
      absences: [{ id: 'a1', personId: 'p1', departureAt: '2026-09-07T11:30', returnAt: '2026-09-07T14:00', reason: 'Termin', status: 'approved' as const, decision: 'OK' }]
    };
    expect(effectivePeriod(withAbsence, person, '2026-09-07', 'morning')).toBe(false);
    expect(effectivePeriod(withAbsence, person, '2026-09-07', 'lunch')).toBe(false);
    expect(effectivePeriod(withAbsence, person, '2026-09-07', 'afternoon')).toBe(false);
    expect(effectivePeriod(withAbsence, person, '2026-09-07', 'dinner')).toBe(true);
  });

  it('maps an overnight absence across midnight', () => {
    expect(absenceOverlaps('2026-09-07T22:00', '2026-09-08T05:00', '2026-09-07', 'overnight')).toBe(true);
    expect(absenceOverlaps('2026-09-08T06:00', '2026-09-08T08:00', '2026-09-07', 'overnight')).toBe(false);
  });
});

describe('planner CSV import', () => {
  it('accepts the standard semicolon template and ignores duplicate names', () => {
    const csv = [
      'first_name;last_name;gender;role;sub_training;external;expert',
      'Arti;Muster;m;Teilnehmer;GLK;nein;ja',
      'Nina;Tal;w;Event Leiter;GLK;ja;ja'
    ].join('\n');
    const rows = parsePlannerCsv(csv, training);
    expect(rows[0]).toMatchObject({ duplicate: true, valid: false });
    expect(rows[0]).toMatchObject({ expert: false });
    expect(rows[1]).toMatchObject({ firstName: 'Nina', gender: 'Weiblich', role: 'Event Leiter', subTrainingId: 'glk', external: true, expert: true, valid: true });
  });

  it('reports unknown sub-trainings and roles', () => {
    const csv = 'first_name,last_name,gender,role,sub_training,external\nJo,Berg,d,Zauberer,XYZ,no';
    const [row] = parsePlannerCsv(csv, training);
    expect(row.valid).toBe(false);
    expect(row.errors.join(' ')).toContain('Rolle');
    expect(row.errors.join(' ')).toContain('XYZ');
  });
});
