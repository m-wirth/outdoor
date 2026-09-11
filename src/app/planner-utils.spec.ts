import { describe, expect, it } from 'vitest';
import { PlannerPerson, Training } from './planner.models';
import { mergeMissingPersonData } from './planner-store.service';
import { absenceOverlaps, defaultPresence, effectivePeriod, parsePlannerCsv, visibleTrainingDates } from './planner-utils';

const person: PlannerPerson = {
  id: 'p1', firstName: 'Arti', lastName: 'Muster', birthDate: '2000-12-01', gender: 'Männlich', role: 'Teilnehmer', subTrainingId: 'glk', external: false, expert: false, nutritionPreferences: [], medicalInformation: '', courseMaterials: null, fieldbedRequested: false, address: '', streetNumber: '', postalCode: '', city: '', privatePhone: '', mobilePhone: '', email: '', rrNumber: '', rrStapoName: '', courseCode: '', additionalInformation: '', archived: false
};

const training: Training = {
  id: 't1', name: 'GTQ 2026-2', startDate: '2026-09-06', endDate: '2026-09-12', mainInstructor: 'Mia Berg',
  subTrainings: [{ id: 'glk', name: 'GLK', instructors: ['Mia Berg'] }, { id: 'tlk', name: 'TLK', instructors: [] }], people: [person], presence: {}, absences: [],
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
  it('accepts the standard semicolon template and marks duplicate names for merging', () => {
    const csv = [
      'first_name;last_name;birth_date;gender;role;sub_training;external;expert;essgewohnheiten;medizinische_informationen;kursunterlagen;feldbett',
      'Arti;Muster;2005-01-02;m;Teilnehmer;GLK;nein;ja;;',
      'Nina;Tal;1999-03-04;w;Event Leiter;GLK;ja;ja;vegetarisch, glutenfrei;Asthma Spray dabei;Ich beziehe die Unterlagen digital und benötige keinen Ordner (gratis);x'
    ].join('\n');
    const rows = parsePlannerCsv(csv, training);
    expect(rows[0]).toMatchObject({ duplicate: true, valid: true });
    expect(rows[0]).toMatchObject({ expert: false });
    expect(rows[1]).toMatchObject({
      firstName: 'Nina',
      birthDate: '1999-03-04',
      gender: 'Weiblich',
      role: 'Event Leiter',
      subTrainingId: 'glk',
      external: true,
      expert: true,
      nutritionPreferences: ['Vegetarisch', 'Glutenfrei'],
      medicalInformation: 'Asthma Spray dabei',
      courseMaterials: 'Digital ohne Ordner',
      fieldbedRequested: true,
      valid: true
    });
  });

  it('reports unknown sub-trainings and roles', () => {
    const csv = 'first_name,last_name,gender,role,sub_training,external\nJo,Berg,d,Zauberer,XYZ,no';
    const [row] = parsePlannerCsv(csv, training);
    expect(row.valid).toBe(false);
    expect(row.errors.join(' ')).toContain('Rolle');
    expect(row.errors.join(' ')).toContain('XYZ');
  });

  it('imports GTQ CSV rows with name duplicate keys and GTQ mappings', () => {
    const csv = [
      ['Person Vorname', 'Person Name', 'Person Adresse', 'Person Hausnummer', 'Person PLZ', 'Person Wohnort', 'Person Geb', 'Person Tel P', 'Person Handy', 'person_mail', 'Person Geschlecht', 'Person Kurs Funktion', 'Person RR Stapo Nr', 'Person RR Stapo Name', 'Person Gemeinde Name', 'kurs_kuerzel', 'Person Datenbank::Person Gesundheit Lebensmittel', 'Person Datenbank::Person Gesundheit Medikamente', 'KursRechnungen::fk_KursLeistungenVierName', 'KursRechnungen::fk_KursLeistungenDreiName'],
      ['Arti', 'Muster', 'Stierenweid', '6', '4950', 'Huttwil', '2005-01-02', '062 962 02 07', '078 896 22 21', 'arti@example.test', 'm', 'Teilnehmer', '20', 'Huttwil - Outdoor', 'Gemeindezentrum Bethel', 'GLK 2026-1', 'keine', '', '', '1. Ich organisiere mich selber (CHF 0)'],
      ['Mara', 'Frei', 'Talackerstrasse', '98', '8404', 'Winterthur', '2001-05-06', '077 440 94 02', '077 440 94 02', 'mara@example.test', 'w', 'Scout', '', 'Reg Nord Ost B', 'Gemeindezentrum Bethel', 'TLK 2026-1', 'vegan, Laktose', 'Medikament morgens', 'Ich nehme den Kursordner aus einem früheren Kurs mit', '2. Ich möchte ein Feldbett ausleihen (CHF 0)']
    ].map((row) => row.join(';')).join('\n');
    const rows = parsePlannerCsv(csv, training);
    expect(rows[0]).toMatchObject({ duplicate: true, valid: true, fieldbedRequested: false });
    expect(rows[1]).toMatchObject({
      firstName: 'Mara',
      lastName: 'Frei',
      birthDate: '2001-05-06',
      gender: 'Weiblich',
      role: 'Scout',
      subTrainingId: 'tlk',
      external: false,
      expert: false,
      nutritionPreferences: ['Vegan', 'Laktosefrei'],
      medicalInformation: 'Medikament morgens',
      courseMaterials: 'Ordner aus früherem Kurs',
      fieldbedRequested: true,
      address: 'Talackerstrasse',
      streetNumber: '98',
      postalCode: '8404',
      city: 'Winterthur',
      privatePhone: '077 440 94 02',
      mobilePhone: '077 440 94 02',
      email: 'mara@example.test',
      rrNumber: '',
      rrStapoName: 'Reg Nord Ost B',
      courseCode: 'TLK 2026-1',
      valid: true
    });
  });

  it('imports the MLK export format and keeps important unmatched fields as additional information', () => {
    const mlkTraining = {
      ...training,
      subTrainings: [...training.subTrainings, { id: 'mlk', name: 'MLK', instructors: [] }],
      people: []
    };
    const csv = [
      [
        'Kurs Anmelde Erstellung Datum', 'php_ahv_nummer', 'Person Vorname', 'Person Name', 'Person Adresse', 'Person Hausnummer', 'Person PLZ', 'Person Wohnort', 'Person Geb', 'Person Tel P', 'Person Tel G', 'Person Handy', 'Person Datenbank::Person Notfall Telefon', 'Person Tel Notfall', 'person_mail', 'Person Mail Pastor', 'Person Mail Hauptleiter', 'Person Mail Eltern', 'Person Geschlecht', 'Person Kurs Funktion', 'Person RR Stapo Nr', 'Person RR Stapo Name', 'Person Gemeinde Name', 'kurs_kuerzel', 'php_kurs_information_eins', 'Person Datenbank::Person Gesundheit Lebensmittel', 'php_kurs_lebensmittel', 'KursRechnungen::fk_KursLeistungenDreiName', 'KursRechnungen::fk_KursLeistungenVierName', 'Person Datenbank::Person Gesundheit Medikamente', 'Person Datenbank::Person Notfall Name', 'Person Datenbank::Person Notfall Vorname', 'Person Datenbank::Person Notfall Bezugsperson', 'Person Datenbank::Person Notfall Mobile', 'Person Datenbank::Person Notfall EMail', 'RR Regionen::RR Delegation Eurocamp 2020', 'RR Regionen Anmeldung::RR Distrikt', 'php_kurs_zimmerpartner', 'Kurs Start Datum Jahr', 'Kurs Belegungsname', 'BelegungBelegungZimmerLayout::ZimmerBeschreibung', 'KDBTeilnehmerCheckedIn', 'KDBTeilnehmerKursAnmeldeStatus'
      ],
      [
        '28.10.2025', '756.1234.1234.12', 'Max', 'Muster', 'Musterstrasse', '12', '1234', 'Demohausen', '13.12.2000', '', '062 000 00 00', '', '079 111 11 11', '079 222 22 22', 'muster.max@mail.com', 'pastor@example.test', '', 'eltern@example.test', 'm', 'Event HLT', '18', 'Aarau - Outdoor', 'MOMENTUM church Aarau', 'MLK 2026-1', 'Kommt später', 'glutenfrei', 'kein Schwein', '1. Ich organisiere mich selber (CHF 0)', '4. Ich bin Leiter und erwerbe kein Brevet/Zertifikat (Fr. 0.00)', 'Medikament morgens', 'Meier', 'Anna', 'Mutter', '079 333 33 33', 'anna@example.test', 'Mittelland-West', 'Mittelland West', 'Sam', '2026', 'MLK2026', 'Zimmer 2', '1', 'Angemeldet'
      ]
    ].map((row) => row.join(';')).join('\n');
    const [row] = parsePlannerCsv(csv, mlkTraining);
    expect(row).toMatchObject({
      firstName: 'Max',
      lastName: 'Muster',
      birthDate: '2000-12-13',
      gender: 'Männlich',
      role: 'Event Hauptleiter',
      subTrainingId: 'mlk',
      external: false,
      expert: false,
      nutritionPreferences: ['Glutenfrei'],
      medicalInformation: 'Medikament morgens',
      fieldbedRequested: false,
      courseMaterials: null,
      address: 'Musterstrasse',
      streetNumber: '12',
      postalCode: '1234',
      city: 'Demohausen',
      privatePhone: '',
      mobilePhone: '',
      email: 'muster.max@mail.com',
      rrNumber: '18',
      rrStapoName: 'Aarau - Outdoor',
      courseCode: 'MLK 2026-1',
      valid: true
    });
    expect(row.additionalInformation).toContain('Tel G: 062 000 00 00');
    expect(row.additionalInformation).toContain('Notfall Name: Anna Meier');
    expect(row.additionalInformation).toContain('Leistung 4: 4. Ich bin Leiter und erwerbe kein Brevet/Zertifikat');
    expect(row.additionalInformation).toContain('Region: Mittelland-West');
    expect(row.additionalInformation).toContain('Anmeldestatus: Angemeldet');
  });

  it('merges duplicate import data without overwriting existing fields', () => {
    const existing: PlannerPerson = {
      ...person,
      birthDate: '',
      gender: 'Keine Angabe',
      subTrainingId: null,
      external: false,
      expert: true,
      nutritionPreferences: ['Vegetarisch'],
      medicalInformation: '',
      courseMaterials: null,
      fieldbedRequested: false,
      address: '',
      streetNumber: '',
      postalCode: '',
      city: '',
      privatePhone: '',
      mobilePhone: '',
      email: '',
      rrNumber: '',
      rrStapoName: '',
      courseCode: '',
      additionalInformation: ''
    };
    const merged = mergeMissingPersonData(existing, {
      firstName: 'Arti',
      lastName: 'Muster',
      birthDate: '2005-01-02',
      gender: 'Weiblich',
      role: 'Teilnehmer',
      subTrainingId: 'glk',
      external: true,
      expert: false,
      nutritionPreferences: ['Vegetarisch', 'Glutenfrei'],
      medicalInformation: 'Asthma Spray dabei',
      courseMaterials: 'Neuer Ordner',
      fieldbedRequested: true,
      address: 'Stierenweid',
      streetNumber: '6',
      postalCode: '4950',
      city: 'Huttwil',
      privatePhone: '062 962 02 07',
      mobilePhone: '078 896 22 21',
      email: 'arti@example.test',
      rrNumber: '20',
      rrStapoName: 'Huttwil - Outdoor',
      courseCode: 'GLK 2026-1',
      additionalInformation: 'Notfall Name: Beispiel'
    });
    expect(merged).toMatchObject({
      birthDate: '2005-01-02',
      gender: 'Weiblich',
      role: 'Teilnehmer',
      subTrainingId: 'glk',
      external: false,
      expert: true,
      nutritionPreferences: ['Vegetarisch', 'Glutenfrei'],
      medicalInformation: 'Asthma Spray dabei',
      courseMaterials: 'Neuer Ordner',
      fieldbedRequested: true,
      address: 'Stierenweid',
      streetNumber: '6',
      postalCode: '4950',
      city: 'Huttwil',
      privatePhone: '062 962 02 07',
      mobilePhone: '078 896 22 21',
      email: 'arti@example.test',
      rrNumber: '20',
      rrStapoName: 'Huttwil - Outdoor',
      courseCode: 'GLK 2026-1',
      additionalInformation: 'Notfall Name: Beispiel'
    });
  });
});
