import { Gender, PlannerPerson, Training } from './planner.models';

interface Cell {
  value: string | number;
  style?: number;
}

type Row = Cell[];

const HEADERS = ['Vorname', 'Name', 'Adresse', 'Nr', 'PLZ', 'Wohnort', 'Geb', 'Tel P', 'Handy', 'Mail', 'm/w', 'Kurs Funktion', 'RR Nr.', 'RR Stapo Name', 'Kurs Kürzel'];
const EXPORT_ROLES = new Set(['Event Hauptleiter', 'Event Leiter', 'Teilnehmer']);
const LEADER_ROLES = new Set(['Event Hauptleiter', 'Event Leiter']);
const COURSE_ORDER = ['GLK', 'TLK', 'QUEM'];
const COURSE_TITLES: Record<string, string> = {
  GLK: 'J+S Leiterkurs',
  TLK: 'J+S Lagerleitermodul',
  QUEM: 'J+S Kurs für Pers. mit päd. Ausbildung'
};

export function downloadParticipantListXlsx(training: Training): void {
  const bytes = buildParticipantListXlsx(training);
  const payload = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(payload).set(bytes);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFilename(training.name)}-tn-liste.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function buildParticipantListXlsx(training: Training): Uint8Array {
  const rows: Row[] = [];
  const mergeRefs: string[] = [];
  for (const group of participantGroups(training)) {
    const titleRow = rows.length + 1;
    rows.push([{ value: courseTitle(training, group.name), style: 1 }]);
    mergeRefs.push(`A${titleRow}:O${titleRow}`);
    rows.push([]);
    rows.push(HEADERS.map((value) => ({ value, style: 2 })));
    for (const person of group.people) rows.push(personToRow(training, person));
    rows.push([]);
    rows.push([]);
  }
  if (!rows.length) {
    rows.push([{ value: 'TN-Liste', style: 1 }]);
    rows.push([]);
    rows.push(HEADERS.map((value) => ({ value, style: 2 })));
  }
  return zipXlsx({
    '[Content_Types].xml': contentTypesXml(),
    '_rels/.rels': rootRelsXml(),
    'xl/workbook.xml': workbookXml(),
    'xl/_rels/workbook.xml.rels': workbookRelsXml(),
    'xl/styles.xml': stylesXml(),
    'xl/worksheets/sheet1.xml': worksheetXml(rows, mergeRefs)
  });
}

function participantGroups(training: Training): Array<{ name: string; people: PlannerPerson[] }> {
  const exportPeople = training.people.filter((person) => !person.archived && EXPORT_ROLES.has(person.role));
  const courseNames = [...new Set([
    ...COURSE_ORDER.filter((name) => training.subTrainings.some((course) => course.name.toLocaleUpperCase('de-CH') === name) || exportPeople.some((person) => courseNameFor(training, person) === name)),
    ...training.subTrainings.map((course) => course.name).filter((name) => !COURSE_ORDER.includes(name.toLocaleUpperCase('de-CH'))),
    ...exportPeople.map((person) => courseNameFor(training, person)).filter((name) => name && !COURSE_ORDER.includes(name.toLocaleUpperCase('de-CH')))
  ])];
  return courseNames.map((name) => ({
    name,
    people: exportPeople
      .filter((person) => courseNameFor(training, person) === name)
      .sort((left, right) => roleRank(left) - roleRank(right)
        || left.lastName.localeCompare(right.lastName, 'de-CH')
        || left.firstName.localeCompare(right.firstName, 'de-CH'))
  })).filter((group) => group.people.length > 0);
}

function personToRow(training: Training, person: PlannerPerson): Row {
  const style = LEADER_ROLES.has(person.role) ? 3 : 0;
  return [
    person.firstName,
    person.lastName,
    person.address,
    person.streetNumber,
    person.postalCode,
    person.city,
    formatSwissDate(person.birthDate),
    person.privatePhone,
    person.mobilePhone,
    person.email,
    genderShort(person.gender),
    person.role,
    person.rrNumber,
    person.rrStapoName,
    person.courseCode || courseCodeFor(training, person)
  ].map((value) => ({ value, style }));
}

function courseNameFor(training: Training, person: PlannerPerson): string {
  const course = training.subTrainings.find((item) => item.id === person.subTrainingId)?.name ?? '';
  const codePrefix = person.courseCode.split(/\s+/, 1)[0] ?? '';
  return (course || codePrefix || 'Ohne Unterkurs').toLocaleUpperCase('de-CH');
}

function courseCodeFor(training: Training, person: PlannerPerson): string {
  const name = courseNameFor(training, person);
  const yearPart = /\b\d{4}(?:-\d+)?\b/.exec(training.name)?.[0] ?? '';
  return [name, yearPart].filter(Boolean).join(' ');
}

function courseTitle(training: Training, courseName: string): string {
  const code = courseName.toLocaleUpperCase('de-CH');
  const yearPart = /\b\d{4}(?:-\d+)?\b/.exec(training.name)?.[0] ?? '';
  const label = [code, yearPart].filter(Boolean).join(' ');
  return COURSE_TITLES[code] ? `${label} (${COURSE_TITLES[code]})` : label;
}

function roleRank(person: PlannerPerson): number {
  if (person.role === 'Event Hauptleiter') return 0;
  if (person.role === 'Event Leiter') return 1;
  return 2;
}

function genderShort(gender: Gender): string {
  if (gender === 'Männlich') return 'm';
  if (gender === 'Weiblich') return 'w';
  if (gender === 'Divers') return 'd';
  return '';
}

function formatSwissDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function worksheetXml(rows: Row[], mergeRefs: string[]): string {
  const columnWidths = [11, 14, 22, 6, 8, 18, 11, 15, 15, 29, 6, 15, 9, 29, 15];
  const rowXml = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((cell, columnIndex) => cellXml(rowNumber, columnIndex + 1, cell)).join('');
    const height = row[0]?.style === 1 ? ' ht="24" customHeight="1"' : '';
    return `<row r="${rowNumber}"${height}>${cells}</row>`;
  }).join('');
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:O${Math.max(rows.length, 1)}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>
  <sheetData>${rowXml}</sheetData>
  ${mergeRefs.length ? `<mergeCells count="${mergeRefs.length}">${mergeRefs.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : ''}
  <pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.2" footer="0.2"/>
  <pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`);
}

function cellXml(row: number, column: number, cell: Cell): string {
  const ref = `${columnName(column)}${row}`;
  const style = cell.style ? ` s="${cell.style}"` : '';
  if (typeof cell.value === 'number') return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(cell.value)}</t></is></c>`;
}

function stylesXml(): string {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10"/><name val="Arial"/></font>
    <font><sz val="20"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><name val="Arial"/></font>
    <font><i/><sz val="10"/><name val="Arial"/></font>
  </fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
}

function workbookXml(): string {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="TN-Liste" sheetId="1" r:id="rId1"/></sheets></workbook>`);
}

function workbookRelsXml(): string {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
}

function rootRelsXml(): string {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
}

function contentTypesXml(): string {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
}

function zipXlsx(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = encoder.encode(path);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centralParts.length, true);
  endView.setUint16(10, centralParts.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return concat([...localParts, ...centralParts, end]);
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function columnName(index: number): string {
  let name = '';
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function xml(value: string): string {
  return value.replace(/>\s+</g, '><').trim();
}

function safeFilename(value: string): string {
  return value.trim().toLocaleLowerCase('de-CH').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'training';
}
