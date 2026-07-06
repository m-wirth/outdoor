export const EXPECTED_HEADERS = [
  'PERSONENNUMMER', 'NAME', 'VORNAME', 'GEBURTSDATUM', 'GESCHLECHT', 'AHV_NR', 'PEID',
  'NATIONALITAET', 'MUTTERSPRACHE', 'ZWEITSPRACHE', 'STRASSE', 'HAUSNUMMER', 'PLZ', 'ORT',
  'LAND', 'TELEFON (PRIVAT)', 'TELEFON (AMTLICH)', 'TELEFON (GSCHÄFTLICH)',
  'E-MAIL (PRIVAT)', 'E-MAIL (AMTLICH)', 'E-MAIL (GESCHÄFTLICH)'
] as const;

export interface ValidationIssue {
  line: number;
  column?: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  rowCount: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidatorOptions {
  maxRows: number;
  requireIdentifier: boolean;
}

interface ParsedCsv {
  rows: string[][];
  lineNumbers: number[];
  errors: ValidationIssue[];
}

const MAX_LENGTHS = [9, 50, 50, 10, 8, 16, 12, 6, 6, 6, 60, 10, 10, 40, 3, 30, 30, 30, 255, 255, 255];
const REQUIRED = new Set([1, 2, 3, 4, 7, 8, 10, 11, 12, 13, 14, 18]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCsv(text: string, options: ValidatorOptions): ValidationResult {
  const parsed = parseSemicolonCsv(text.replace(/^\uFEFF/, ''));
  const errors = [...parsed.errors];
  const warnings: ValidationIssue[] = [];

  if (parsed.rows.length === 0) {
    errors.push(issue(1, 'HEADER_MISSING', 'Die Datei enthält keine Kopfzeile.'));
    return result(0, errors, warnings);
  }

  const header = withoutTrailingEmpty(parsed.rows[0]);
  if (header.length !== EXPECTED_HEADERS.length || header.some((value, index) => value !== EXPECTED_HEADERS[index])) {
    const firstDifference = EXPECTED_HEADERS.findIndex((value, index) => header[index] !== value);
    const detail = firstDifference >= 0
      ? `Spalte ${firstDifference + 1} muss «${EXPECTED_HEADERS[firstDifference]}» heissen.`
      : `Erwartet werden genau ${EXPECTED_HEADERS.length} Spalten.`;
    errors.push(issue(parsed.lineNumbers[0], 'HEADER_INVALID', `Die Kopfzeile stimmt nicht. ${detail}`));
  }

  const dataRows = parsed.rows.slice(1).map((row, index) => ({
    values: withoutTrailingEmpty(row),
    line: parsed.lineNumbers[index + 1]
  })).filter(({ values }) => values.some((value) => value.trim() !== ''));

  if (dataRows.length === 0) {
    warnings.push(issue(1, 'NO_DATA', 'Die Kopfzeile ist vorhanden, aber es wurden noch keine Personen erfasst.'));
  }
  if (dataRows.length > options.maxRows) {
    errors.push(issue(dataRows[options.maxRows].line, 'TOO_MANY_ROWS', `Es sind höchstens ${options.maxRows} Personen pro Datei erlaubt.`));
  }

  for (const { values, line } of dataRows) {
    if (values.length !== EXPECTED_HEADERS.length) {
      errors.push(issue(line, 'COLUMN_COUNT', `Die Zeile enthält ${values.length} statt ${EXPECTED_HEADERS.length} Spalten.`));
      continue;
    }
    validateRow(values.map((value) => value.trim()), line, options, errors);
  }

  return result(dataRows.length, errors, warnings);
}

function validateRow(row: string[], line: number, options: ValidatorOptions, errors: ValidationIssue[]): void {
  row.forEach((value, index) => {
    if (value.length > MAX_LENGTHS[index]) {
      errors.push(issue(line, 'TOO_LONG', `Maximal ${MAX_LENGTHS[index]} Zeichen erlaubt.`, EXPECTED_HEADERS[index]));
    }
    if (REQUIRED.has(index) && value === '') {
      errors.push(issue(line, 'REQUIRED', 'Pflichtfeld darf nicht leer sein.', EXPECTED_HEADERS[index]));
    }
  });

  if (row[0] && !/^\d{1,9}$/.test(row[0])) add(errors, line, 0, 'FORMAT', 'Nur 1 bis 9 Ziffern erlaubt.');
  if (row[3] && !isValidDate(row[3])) add(errors, line, 3, 'FORMAT', 'Datum im Format TT.MM.JJJJ erwartet.');
  if (row[4] && !['m', 'w', 'männlich', 'weiblich'].includes(row[4].toLowerCase())) {
    add(errors, line, 4, 'FORMAT', 'Erlaubt sind m, w, männlich oder weiblich.');
  }
  if (row[5] && !isValidAhv(row[5])) add(errors, line, 5, 'FORMAT', 'AHV-Nr. als 756.xxxx.xxxx.xx oder 756xxxxxxxxxx erwartet.');
  if (row[6] && !/^\d{1,12}$/.test(row[6])) add(errors, line, 6, 'FORMAT', 'PEID muss aus höchstens 12 Ziffern bestehen.');
  if (options.requireIdentifier && !row[5] && !row[6]) {
    errors.push(issue(line, 'IDENTIFIER_REQUIRED', 'Mindestens AHV_NR oder PEID ist erforderlich.', 'AHV_NR / PEID'));
  }
  validateChoice(row[7], ['CH', 'FL', 'Andere'], line, 7, errors);
  validateChoice(row[8], ['DE', 'FR', 'IT', 'Andere'], line, 8, errors);
  if (row[9]) validateChoice(row[9], ['DE', 'FR', 'IT', 'Andere'], line, 9, errors);
  if (row[14] && !/^[A-Za-z]{2}$/.test(row[14])) add(errors, line, 14, 'FORMAT', 'ISO-3166-Alpha-2-Ländercode erwartet (z. B. CH).');

  [15, 16, 17].forEach((index) => {
    if (row[index] && !isValidPhone(row[index])) add(errors, line, index, 'FORMAT', 'Gültige Telefonnummer mit Vorwahl erwartet.');
  });
  [18, 19, 20].forEach((index) => {
    if (row[index] && !EMAIL.test(row[index])) add(errors, line, index, 'FORMAT', 'Gültige E-Mail-Adresse erwartet.');
  });
}

function parseSemicolonCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  const lineNumbers: number[] = [];
  const errors: ValidationIssue[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else { field += char; if (char === '\n') line++; }
      continue;
    }
    if (char === '"' && field === '') quoted = true;
    else if (char === ';') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); lineNumbers.push(rowLine); row = []; field = ''; line++; rowLine = line; }
    else field += char;
  }
  if (quoted) errors.push(issue(line, 'QUOTE_UNCLOSED', 'Ein Anführungszeichen wurde nicht geschlossen.'));
  if (field !== '' || row.length > 0) { row.push(field.replace(/\r$/, '')); rows.push(row); lineNumbers.push(rowLine); }
  return { rows, lineNumbers, errors };
}

function withoutTrailingEmpty(row: string[]): string[] {
  return row.length === EXPECTED_HEADERS.length + 1 && row.at(-1) === '' ? row.slice(0, -1) : row;
}

function isValidDate(value: string): boolean {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return false;
  const [, day, month, year] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date <= new Date();
}

function isValidAhv(value: string): boolean {
  const digits = value.replace(/\./g, '');
  if (!/^756\d{10}$/.test(digits) || !/^(?:756\d{10}|756\.\d{4}\.\d{4}\.\d{2})$/.test(value)) return false;
  const sum = [...digits.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[12]);
}

function isValidPhone(value: string): boolean {
  return /^\+?[\d\s'()/.\-]{7,30}$/.test(value) && value.replace(/\D/g, '').length >= 7;
}

function validateChoice(value: string, allowed: string[], line: number, index: number, errors: ValidationIssue[]): void {
  if (value && !allowed.includes(value)) add(errors, line, index, 'FORMAT', `Erlaubt: ${allowed.join(', ')}.`);
}

function add(errors: ValidationIssue[], line: number, index: number, code: string, message: string): void {
  errors.push(issue(line, code, message, EXPECTED_HEADERS[index]));
}

function issue(line: number, code: string, message: string, column?: string): ValidationIssue {
  return { line, code, message, ...(column ? { column } : {}) };
}

function result(rowCount: number, errors: ValidationIssue[], warnings: ValidationIssue[]): ValidationResult {
  return { valid: errors.length === 0, rowCount, errors, warnings };
}
