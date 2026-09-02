import {
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

export function parsePlannerCsv(text: string, training: Training): ImportRow[] {
  const delimiter = firstLine(text).includes(';') ? ';' : ',';
  const rows = parseCsv(text.replace(/^\uFEFF/, ''), delimiter).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  const column = (...names: string[]): number => headers.findIndex((header) => names.includes(header));
  const columns = {
    firstName: column('first_name', 'vorname'),
    lastName: column('last_name', 'name', 'nachname'),
    gender: column('gender', 'geschlecht'),
    role: column('role', 'funktion', 'rolle'),
    subTraining: column('sub_training', 'kurs', 'unterkurs'),
    external: column('external', 'extern'),
    expert: column('expert', 'experte'),
    nutritionPreferences: column('nutrition_preferences', 'essgewohnheiten', 'ernaehrung', 'ernahrung', 'allergien', 'allergies'),
    medicalInformation: column('medical_information', 'medizinische_informationen', 'medizinisch', 'gesundheit', 'health_info')
  };
  const existing = new Set(training.people.map((person) => normalizedName(person.firstName, person.lastName)));
  const seen = new Set<string>();

  return rows.slice(1).map((row, index) => {
    const firstName = value(row, columns.firstName);
    const lastName = value(row, columns.lastName);
    const gender = parseGender(value(row, columns.gender));
    const role = parseRole(value(row, columns.role));
    const subTrainingName = value(row, columns.subTraining);
    const subTraining = training.subTrainings.find((item) => item.name.toLocaleLowerCase('de-CH') === subTrainingName.toLocaleLowerCase('de-CH'));
    const externalValue = value(row, columns.external).toLocaleLowerCase('de-CH');
    const expertValue = value(row, columns.expert).toLocaleLowerCase('de-CH');
    const nutritionPreferences = parseNutritionPreferences(value(row, columns.nutritionPreferences));
    const medicalInformation = value(row, columns.medicalInformation);
    const errors: string[] = [];
    if (!firstName) errors.push('Vorname fehlt.');
    if (!lastName) errors.push('Name fehlt.');
    if (!gender) errors.push('Geschlecht ist ungültig.');
    if (!role) errors.push('Rolle ist ungültig.');
    if (subTrainingName && !subTraining) errors.push(`Unterkurs «${subTrainingName}» existiert nicht.`);
    if (columns.firstName < 0 || columns.lastName < 0 || columns.gender < 0 || columns.role < 0) errors.push('Pflichtspalten fehlen in der Kopfzeile.');
    const nameKey = normalizedName(firstName, lastName);
    const duplicate = !!nameKey && (existing.has(nameKey) || seen.has(nameKey));
    if (!duplicate) seen.add(nameKey);
    return {
      line: index + 2,
      firstName,
      lastName,
      gender: gender ?? 'Keine Angabe',
      role: role ?? 'Sonstige',
      subTrainingId: subTraining?.id ?? null,
      external: ['ja', 'yes', 'true', '1', 'x'].includes(externalValue),
      expert: role !== 'Teilnehmer' && role !== 'Gast' && ['ja', 'yes', 'true', '1', 'x'].includes(expertValue),
      nutritionPreferences,
      medicalInformation,
      duplicate,
      valid: errors.length === 0 && !duplicate,
      errors
    };
  });
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
    'sonstige': 'Sonstige'
  };
  return aliases[normalized] ?? PLANNER_ROLES.find((role) => role.toLocaleLowerCase('de-CH') === normalized) ?? null;
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

export function localDateLabel(value: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('de-CH', options ?? { weekday: 'short', day: '2-digit', month: '2-digit' })
    .format(new Date(`${value}T12:00:00`));
}

export function durationDays(start: string, end: string): number {
  return Math.round((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / DAY_MS) + 1;
}
