import type { SyntheticServiceLine } from './types';

export const SERVICE_LINE_CSV_COLUMNS = [
  'sourceSystem',
  'sourceLineId',
  'encounterRef',
  'versionRef',
  'serviceDate',
  'code',
  'modifiers',
  'units',
  'placeOfService',
  'renderingProviderId',
  'locationId',
  'status',
  'postedDate'
] as const;

const QUOTE_TRIGGER = /[",\r\n]/;

function cellValue(line: SyntheticServiceLine, column: string): string {
  switch (column) {
    case 'versionRef':
      return line.versionRef ?? '';
    case 'serviceDate':
    case 'postedDate':
      return (column === 'serviceDate' ? line.serviceDate : line.postedDate).toString();
    case 'modifiers':
      return line.modifiers.join('|');
    case 'units':
      return String(line.units);
    default:
      return String(line[column as keyof SyntheticServiceLine]);
  }
}

export function toCsv(lines: readonly SyntheticServiceLine[]): string {
  const header = SERVICE_LINE_CSV_COLUMNS.join(',');
  const rows = lines.map((line) =>
    SERVICE_LINE_CSV_COLUMNS.map((column) => {
      const value = cellValue(line, column);
      return QUOTE_TRIGGER.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    }).join(',')
  );
  return [header, ...rows].map((row) => `${row}\n`).join('');
}
