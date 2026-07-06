import { describe, expect, it } from 'vitest';
import { EXPECTED_HEADERS, validateCsv } from './csv-validator';

const options = { maxRows: 200, requireIdentifier: true };
const header = `${EXPECTED_HEADERS.join(';')};`;
const validRow = [
  '123', 'Muster', 'Arti', '10.05.2014', 'm', '756.1234.5678.97', '', 'CH', 'DE', '',
  'Blumenweg', '14', '4512', 'Bellach', 'CH', '+41 79 123 45 67', '', '', 'test@test.ch', '', ''
].join(';') + ';';

describe('validateCsv', () => {
  it('accepts the official header-only template with its trailing semicolon', () => {
    const result = validateCsv(`\uFEFF${header}\n`, options);
    expect(result.valid).toBe(true);
    expect(result.rowCount).toBe(0);
    expect(result.warnings[0]?.code).toBe('NO_DATA');
  });

  it('accepts a valid person row', () => {
    const result = validateCsv(`${header}\n${validRow}\n`, options);
    expect(result).toMatchObject({ valid: true, rowCount: 1, errors: [] });
  });

  it('reports the physical line and column for invalid required fields', () => {
    const row = validRow.split(';');
    row[1] = '';
    row[3] = '31.02.2020';
    const result = validateCsv(`${header}\n${row.join(';')}\n`, options);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: 2, column: 'NAME', code: 'REQUIRED' }),
      expect.objectContaining({ line: 2, column: 'GEBURTSDATUM', code: 'FORMAT' })
    ]));
  });

  it('supports quoted semicolons and escaped quotes', () => {
    const row = validRow.split(';');
    row[10] = '"Waldweg; Abschnitt ""Nord"""';
    const result = validateCsv(`${header}\n${row.join(';')}\n`, options);
    expect(result.valid).toBe(true);
  });

  it('can allow missing identifiers for already-linked persons', () => {
    const row = validRow.split(';');
    row[5] = '';
    const result = validateCsv(`${header}\n${row.join(';')}\n`, { ...options, requireIdentifier: false });
    expect(result.valid).toBe(true);
  });

  it('rejects a changed header order', () => {
    const changed = [...EXPECTED_HEADERS];
    [changed[1], changed[2]] = [changed[2], changed[1]];
    const result = validateCsv(changed.join(';'), options);
    expect(result.errors[0]).toMatchObject({ code: 'HEADER_INVALID', line: 1 });
  });
});
