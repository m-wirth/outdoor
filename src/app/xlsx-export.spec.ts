import { describe, expect, it } from 'vitest';
import { PlannerPerson, Training } from './planner.models';
import { buildParticipantListXlsx } from './xlsx-export';

const basePerson: PlannerPerson = {
  id: 'p1',
  firstName: 'Armin',
  lastName: 'Pfister',
  birthDate: '1962-03-06',
  gender: 'Männlich',
  role: 'Event Leiter',
  subTrainingId: 'glk',
  external: false,
  expert: false,
  nutritionPreferences: [],
  medicalInformation: '',
  courseMaterials: null,
  fieldbedRequested: false,
  address: 'Stierenweid',
  streetNumber: '6',
  postalCode: '4950',
  city: 'Huttwil',
  privatePhone: '062 962 02 07',
  mobilePhone: '078 896 22 21',
  email: 'armin_pfister@sunrise.ch',
  rrNumber: '20',
  rrStapoName: 'Huttwil (Heilsarmee) - Outdoor',
  courseCode: 'GLK 2026-1',
  archived: false
};

const training: Training = {
  id: 't1',
  name: 'GTQ 2026-1',
  startDate: '2026-10-04',
  endDate: '2026-10-10',
  mainInstructor: 'Marco Wirth',
  subTrainings: [
    { id: 'glk', name: 'GLK', instructors: [] },
    { id: 'tlk', name: 'TLK', instructors: [] },
    { id: 'quem', name: 'QUEM', instructors: [] }
  ],
  people: [
    basePerson,
    { ...basePerson, id: 'p2', firstName: 'Daniel', lastName: 'Dörig', role: 'Teilnehmer', subTrainingId: 'tlk', courseCode: 'TLK 2026-1' },
    { ...basePerson, id: 'p3', firstName: 'Marco', lastName: 'Inniger', role: 'Teilnehmer', subTrainingId: 'quem', courseCode: 'QUEM 2026-1' },
    { ...basePerson, id: 'p4', firstName: 'Bianca', lastName: 'Bösch', role: 'Küche', subTrainingId: 'glk', courseCode: 'GLK 2026-1' }
  ],
  presence: {},
  absences: [],
  createdAt: '2026-09-07T00:00:00Z',
  updatedAt: '2026-09-07T00:00:00Z'
};

describe('participant list xlsx export', () => {
  it('creates an Excel workbook grouped by GLK, TLK and QUEM without kitchen staff', () => {
    const bytes = buildParticipantListXlsx(training);
    const text = new TextDecoder().decode(bytes);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(text.indexOf('GLK 2026-1')).toBeLessThan(text.indexOf('TLK 2026-1'));
    expect(text.indexOf('TLK 2026-1')).toBeLessThan(text.indexOf('QUEM 2026-1'));
    expect(text).toContain('Vorname');
    expect(text).toContain('Kurs Funktion');
    expect(text).toContain('Armin');
    expect(text).toContain('Daniel');
    expect(text).not.toContain('Bianca');
    expect(text).toContain('paperSize="9"');
    expect(text).toContain('orientation="landscape"');
  });
});
