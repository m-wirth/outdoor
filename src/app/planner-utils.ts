import {
  CourseMaterialOption,
  COURSE_MATERIAL_OPTIONS,
  DayPresence,
  Gender,
  GENDERS,
  ImportRow,
  MealPeriod,
  NUTRITION_PREFERENCES,
  NutritionPreference,
  Period,
  PlannerPerson,
  PLANNER_ROLES,
  PlannerRole,
  Training
} from './planner.models';

const DAY_MS = 86_400_000;
const EARLY_ROLES = new Set<PlannerRole>(['Event Hauptleiter', 'Event Leiter', 'Küche', 'Expertenpraktikant']);

export function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

export function datesBetween(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const result: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) result.push(cursor);
  return result;
}

export function visibleTrainingDates(training: Training): string[] {
  return datesBetween(addDays(training.startDate, -1), training.endDate);
}

export function defaultPresence(training: Training, person: PlannerPerson, date: string): DayPresence {
  const empty = (): DayPresence => ({ morning: false, lunch: false, afternoon: false, dinner: false, overnight: false });
  if (person.role === 'Gast') return empty();
  const priorDay = addDays(training.startDate, -1);
  if (date === priorDay) {
    return EARLY_ROLES.has(person.role)
      ? { morning: false, lunch: false, afternoon: false, dinner: true, overnight: true }
      : empty();
  }
  if (date < training.startDate || date > training.endDate) return empty();
  return { morning: true, lunch: true, afternoon: true, dinner: true, overnight: date < training.endDate };
}

export function plannedPresence(training: Training, person: PlannerPerson, date: string): DayPresence {
  return training.presence[person.id]?.[date] ?? defaultPresence(training, person, date);
}

export function effectivePeriod(training: Training, person: PlannerPerson, date: string, period: Period): boolean {
  const planned = plannedPresence(training, person, date)[period];
  if (!planned) return false;
  return !training.absences.some((absence) =>
    absence.personId === person.id && absence.status === 'approved' && absenceOverlaps(absence.departureAt, absence.returnAt, date, period)
  );
}

export function absenceOverlaps(departureAt: string, returnAt: string, date: string, period: Period): boolean {
  const periodHours: Record<Period, [number, number, number]> = {
    morning: [6, 12, 0],
    lunch: [12, 13, 0],
    afternoon: [13, 18, 0],
    dinner: [18, 19, 0],
    overnight: [19, 6, 1]
  };
  const [startHour, endHour, endDayOffset] = periodHours[period];
  const start = new Date(`${date}T${String(startHour).padStart(2, '0')}:00:00`).getTime();
  const endDate = endDayOffset ? addDays(date, endDayOffset) : date;
  const end = new Date(`${endDate}T${String(endHour).padStart(2, '0')}:00:00`).getTime();
  const departure = new Date(departureAt).getTime();
  const returning = new Date(returnAt).getTime();
  return Number.isFinite(departure) && Number.isFinite(returning) && departure < end && returning > start;
}

export function normalizedName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim().toLocaleLowerCase('de-CH').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ');
}

export function importDuplicateKey(firstName: string, lastName: string, _birthDate = ''): string {
  return normalizedName(firstName, lastName);
}

export function parsePlannerCsv(text: string, training: Training): ImportRow[] {
  const delimiter = firstLine(text).includes(';') ? ';' : ',';
  const rows = parseCsv(text.replace(/^\uFEFF/, ''), delimiter).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  if (isGtqHeaders(headers)) return parseGtqRows(rows, headers, training);
  const column = (...names: string[]): number => headers.findIndex((header) => names.includes(header));
  const fuzzyColumn = (...needles: string[]): number => headers.findIndex((header) => needles.some((needle) => header.includes(needle)));
  const columns = {
    firstName: column('first_name', 'vorname'),
    lastName: column('last_name', 'name', 'nachname'),
    birthDate: column('birth_date', 'geburtsdatum', 'geburtstag', 'person_geb'),
    gender: column('gender', 'geschlecht'),
    role: column('role', 'funktion', 'rolle'),
    subTraining: column('sub_training', 'kurs', 'unterkurs'),
    external: column('external', 'extern'),
    expert: column('expert', 'experte'),
    nutritionPreferences: column('nutrition_preferences', 'essgewohnheiten', 'ernaehrung', 'ernahrung', 'allergien', 'allergies'),
    medicalInformation: column('medical_information', 'medizinische_informationen', 'medizinisch', 'gesundheit', 'health_info'),
    courseMaterials: column('course_materials', 'kursunterlagen', 'unterlagen', 'kursunterlage'),
    fieldbedRequested: column('fieldbed', 'feldbett', 'feldbett_ausleihen', 'fieldbed_requested')
  };
  if (columns.courseMaterials < 0) columns.courseMaterials = fuzzyColumn('kursunterlagen', 'kursunterlage');
  if (columns.fieldbedRequested < 0) columns.fieldbedRequested = fuzzyColumn('feldbett');
  const existing = new Set(training.people.map((person) => importDuplicateKey(person.firstName, person.lastName, person.birthDate)));
  const seen = new Set<string>();

  return rows.slice(1).map((row, index) => {
    const firstName = value(row, columns.firstName);
    const lastName = value(row, columns.lastName);
    const birthDate = normalizeBirthDate(value(row, columns.birthDate));
    const gender = parseGender(value(row, columns.gender));
    const role = parseRole(value(row, columns.role));
    const subTrainingName = value(row, columns.subTraining);
    const subTraining = training.subTrainings.find((item) => item.name.toLocaleLowerCase('de-CH') === subTrainingName.toLocaleLowerCase('de-CH'));
    const externalValue = value(row, columns.external).toLocaleLowerCase('de-CH');
    const expertValue = value(row, columns.expert).toLocaleLowerCase('de-CH');
    const nutritionPreferences = parseNutritionPreferences(value(row, columns.nutritionPreferences));
    const medicalInformation = value(row, columns.medicalInformation);
    const courseMaterials = parseCourseMaterials(value(row, columns.courseMaterials));
    const fieldbedRequested = parseBoolean(value(row, columns.fieldbedRequested));
    const errors: string[] = [];
    if (!firstName) errors.push('Vorname fehlt.');
    if (!lastName) errors.push('Name fehlt.');
    if (!gender) errors.push('Geschlecht ist ungültig.');
    if (!role) errors.push('Rolle ist ungültig.');
    if (subTrainingName && !subTraining) errors.push(`Unterkurs «${subTrainingName}» existiert nicht.`);
    if (columns.firstName < 0 || columns.lastName < 0 || columns.gender < 0 || columns.role < 0) errors.push('Pflichtspalten fehlen in der Kopfzeile.');
    const nameKey = importDuplicateKey(firstName, lastName, birthDate);
    const duplicate = !!nameKey && (existing.has(nameKey) || seen.has(nameKey));
    if (!duplicate) seen.add(nameKey);
    return {
      line: index + 2,
      firstName,
      lastName,
      birthDate,
      gender: gender ?? 'Keine Angabe',
      role: role ?? 'Sonstige',
      subTrainingId: subTraining?.id ?? null,
      external: ['ja', 'yes', 'true', '1', 'x'].includes(externalValue),
      expert: role !== 'Teilnehmer' && role !== 'Gast' && ['ja', 'yes', 'true', '1', 'x'].includes(expertValue),
      nutritionPreferences,
      medicalInformation,
      courseMaterials,
      fieldbedRequested,
      duplicate,
      valid: errors.length === 0,
      errors
    };
  });
}

function isGtqHeaders(headers: string[]): boolean {
  return headers.includes('person_vorname') && headers.includes('person_name') && headers.includes('person_kurs_funktion');
}

function parseGtqRows(rows: string[][], headers: string[], training: Training): ImportRow[] {
  const column = (...names: string[]): number => headers.findIndex((header) => names.includes(header));
  const fuzzyColumn = (...needles: string[]): number => headers.findIndex((header) => needles.some((needle) => header.includes(needle)));
  const columns = {
    firstName: column('person_vorname'),
    lastName: column('person_name'),
    birthDate: column('person_geb'),
    gender: column('person_geschlecht'),
    role: column('person_kurs_funktion'),
    stapoName: column('person_rr_stapo_name'),
    congregationName: column('person_gemeinde_name'),
    subTraining: column('kurs_kuerzel'),
    nutrition: column('person_datenbank::person_gesundheit_lebensmittel'),
    medical: column('person_datenbank::person_gesundheit_medikamente'),
    courseMaterials: fuzzyColumn('kursunterlagen', 'kursunterlage'),
    fieldbedRequested: fuzzyColumn('feldbett')
  };
  const existing = new Set(training.people.map((person) => importDuplicateKey(person.firstName, person.lastName, person.birthDate)));
  const seen = new Set<string>();

  return rows.slice(1).map((row, index) => {
    const firstName = value(row, columns.firstName);
    const lastName = value(row, columns.lastName);
    const birthDate = normalizeBirthDate(value(row, columns.birthDate));
    const gender = parseGender(value(row, columns.gender));
    const role = parseGtqRole(value(row, columns.role));
    const subTrainingName = parseSubTrainingFromCourse(value(row, columns.subTraining));
    const subTraining = subTrainingName
      ? training.subTrainings.find((item) => item.name.toLocaleLowerCase('de-CH') === subTrainingName.toLocaleLowerCase('de-CH'))
      : null;
    const stapoName = value(row, columns.stapoName);
    const congregationName = value(row, columns.congregationName);
    const errors: string[] = [];
    if (!firstName) errors.push('Vorname fehlt.');
    if (!lastName) errors.push('Name fehlt.');
    if (!birthDate) errors.push('Geburtsdatum fehlt oder ist ungültig.');
    if (!gender) errors.push('Geschlecht ist ungültig.');
    if (!role) errors.push('Rolle ist ungültig.');
    if (subTrainingName && !subTraining) errors.push(`Unterkurs «${subTrainingName}» existiert nicht.`);
    if (columns.firstName < 0 || columns.lastName < 0 || columns.birthDate < 0 || columns.gender < 0 || columns.role < 0) errors.push('Pflichtspalten fehlen in der Kopfzeile.');
    const key = importDuplicateKey(firstName, lastName, birthDate);
    const duplicate = !!key && (existing.has(key) || seen.has(key));
    if (!duplicate) seen.add(key);
    return {
      line: index + 2,
      firstName,
      lastName,
      birthDate,
      gender: gender ?? 'Keine Angabe',
      role: role ?? 'Sonstige',
      subTrainingId: subTraining?.id ?? null,
      external: !stapoName || !congregationName,
      expert: false,
      nutritionPreferences: parseNutritionPreferences(value(row, columns.nutrition)),
      medicalInformation: value(row, columns.medical),
      courseMaterials: parseCourseMaterials(value(row, columns.courseMaterials)),
      fieldbedRequested: parseBoolean(value(row, columns.fieldbedRequested)),
      duplicate,
      valid: errors.length === 0,
      errors
    };
  });
}

function parseCourseMaterials(value: string): CourseMaterialOption | null {
  const normalized = normalizeOptionKey(value);
  if (!normalized) return null;
  if (normalized.includes('noch_keinen_ordner') || normalized.includes('brauche_einen') || normalized.includes('neuer_ordner')) return 'Neuer Ordner';
  if (normalized.includes('digital') || normalized.includes('keinen_ordner') || normalized.includes('kein_ordner')) return 'Digital ohne Ordner';
  if (normalized.includes('fruheren_kurs') || normalized.includes('frueheren_kurs') || normalized.includes('fruherem_kurs') || normalized.includes('frueherem_kurs') || normalized.includes('fruherer_kurs')) return 'Ordner aus früherem Kurs';
  return COURSE_MATERIAL_OPTIONS.find((option) => normalizeOptionKey(option) === normalized) ?? null;
}

function parseBoolean(value: string): boolean {
  const normalized = normalizeOptionKey(value);
  if (!normalized || ['nein', 'no', 'false', '0'].includes(normalized) || normalized.includes('kein_feldbett')) return false;
  return ['ja', 'yes', 'true', '1', 'x', 'checked', 'angekreuzt', 'ausleihen'].includes(normalized)
    || normalized.includes('feldbett')
    || normalized.includes('ausleihen');
}

function normalizeOptionKey(value: string): string {
  return value.trim().toLocaleLowerCase('de-CH').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseNutritionPreferences(value: string): NutritionPreference[] {
  const aliases: Record<string, NutritionPreference> = {
    'vegetarisch': 'Vegetarisch',
    'vegetarian': 'Vegetarisch',
    'vegi': 'Vegetarisch',
    'veggie': 'Vegetarisch',
    'vegan': 'Vegan',
    'laktosefrei': 'Laktosefrei',
    'lactose free': 'Laktosefrei',
    'lactose-free': 'Laktosefrei',
    'laktose': 'Laktosefrei',
    'glutenfrei': 'Glutenfrei',
    'gluten free': 'Glutenfrei',
    'gluten-free': 'Glutenfrei',
    'zoeliakie': 'Glutenfrei',
    'zoliakie': 'Glutenfrei',
    'zöliakie': 'Glutenfrei',
    'nussallergie': 'Nussallergie',
    'nüsse': 'Nussallergie',
    'nusse': 'Nussallergie',
    'nuts': 'Nussallergie',
    'erdnussallergie': 'Erdnussallergie',
    'erdnüsse': 'Erdnussallergie',
    'erdnusse': 'Erdnussallergie',
    'peanuts': 'Erdnussallergie',
    'fischallergie': 'Fischallergie',
    'fisch': 'Fischallergie',
    'fish': 'Fischallergie',
    'meeresfruchteallergie': 'Meeresfrüchteallergie',
    'meeresfrüchteallergie': 'Meeresfrüchteallergie',
    'meeresfrüchte': 'Meeresfrüchteallergie',
    'meeresfruchte': 'Meeresfrüchteallergie',
    'seafood': 'Meeresfrüchteallergie',
    'ei-allergie': 'Ei-Allergie',
    'eiallergie': 'Ei-Allergie',
    'ei': 'Ei-Allergie',
    'egg': 'Ei-Allergie',
    'soja-allergie': 'Soja-Allergie',
    'soja': 'Soja-Allergie',
    'soy': 'Soja-Allergie',
    'sesam-allergie': 'Sesam-Allergie',
    'sesam': 'Sesam-Allergie',
    'sesame': 'Sesam-Allergie',
    'schweinefleischfrei': 'Schweinefleischfrei',
    'kein schwein': 'Schweinefleischfrei',
    'pork free': 'Schweinefleischfrei',
    'halal': 'Halal',
    'koscher': 'Koscher',
    'kosher': 'Koscher'
  };
  return [...new Set(value.split(/[,;|/\n]+/)
    .map((item) => normalizeNutritionKey(item))
    .map((key) => aliases[key] ?? NUTRITION_PREFERENCES.find((preference) => normalizeNutritionKey(preference) === key))
    .filter((item): item is NutritionPreference => !!item))];
}

function normalizeNutritionKey(value: string): string {
  return value.trim().toLocaleLowerCase('de-CH').normalize('NFKD').replace(/\p{Diacritic}/gu, '');
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function mealLabel(meal: MealPeriod): string {
  return meal === 'lunch' ? 'Mittagessen' : 'Abendessen';
}

function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0] ?? '';
}

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase('de-CH').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[\s-]+/g, '_');
}

function value(row: string[], index: number): string {
  return index < 0 ? '' : (row[index] ?? '').trim();
}

function parseRole(value: string): PlannerRole | null {
  const normalized = value.trim().toLocaleLowerCase('de-CH');
  const aliases: Record<string, PlannerRole> = {
    'event hauptleiter': 'Event Hauptleiter',
    'event leiter': 'Event Leiter',
    'leiter': 'Event Leiter',
    'küche': 'Küche',
    'kuche': 'Küche',
    'teilnehmer': 'Teilnehmer',
    'tn': 'Teilnehmer',
    'gast': 'Gast',
    'besuch': 'Gast',
    'expertenpraktikant': 'Expertenpraktikant',
    'exp p': 'Expertenpraktikant',
    'scout': 'Scout',
    'sonstige': 'Sonstige'
  };
  return aliases[normalized] ?? PLANNER_ROLES.find((role) => role.toLocaleLowerCase('de-CH') === normalized) ?? null;
}

function parseGtqRole(value: string): PlannerRole | null {
  const normalized = value.trim().toLocaleLowerCase('de-CH');
  const aliases: Record<string, PlannerRole> = {
    'event leiter': 'Event Leiter',
    'event hauptleiter': 'Event Hauptleiter',
    'teilnehmer': 'Teilnehmer',
    'küche': 'Küche',
    'kuche': 'Küche',
    'scout': 'Scout'
  };
  return aliases[normalized] ?? parseRole(value);
}

function parseSubTrainingFromCourse(value: string): string {
  const normalized = value.trim();
  const match = /^([A-Za-zÄÖÜäöüÉÈÀÇÑ]+)\s+\d{4}(?:-\d+)?/u.exec(normalized);
  return (match?.[1] ?? normalized).trim();
}

function parseGender(value: string): Gender | null {
  const aliases: Record<string, Gender> = {
    'w': 'Weiblich', 'weiblich': 'Weiblich', 'female': 'Weiblich',
    'm': 'Männlich', 'männlich': 'Männlich', 'mannlich': 'Männlich', 'male': 'Männlich',
    'd': 'Divers', 'divers': 'Divers', 'diverse': 'Divers',
    '': 'Keine Angabe', 'keine angabe': 'Keine Angabe', 'unknown': 'Keine Angabe'
  };
  const normalized = value.trim().toLocaleLowerCase('de-CH');
  return aliases[normalized] ?? GENDERS.find((gender) => gender.toLocaleLowerCase('de-CH') === normalized) ?? null;
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && !field) quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

function normalizeBirthDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return isValidDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? trimmed : '';
  const swiss = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (swiss) {
    const [, day, month, year] = swiss.map(Number);
    return isValidDateParts(year, month, day) ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
  }
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  return isValidDateParts(year, month, day) ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function localDateLabel(value: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('de-CH', options ?? { weekday: 'short', day: '2-digit', month: '2-digit' })
    .format(new Date(`${value}T12:00:00`));
}

export function durationDays(start: string, end: string): number {
  return Math.round((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / DAY_MS) + 1;
}
