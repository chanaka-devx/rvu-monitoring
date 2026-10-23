import { aServiceLine } from './builders';
import { SERVICE_LINE_CSV_COLUMNS, toCsv } from './csv';
import { describe, expect, it } from 'vitest';

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  return rows;
}

function rowValues(row: string[], header: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < header.length; index += 1) {
    const value = row[index];
    if (value === undefined) {
      throw new Error(`row is missing column ${header[index] as string}`);
    }
    values[header[index] as string] = value;
  }
  return values;
}

describe('toCsv', () => {
  it('starts with the column header row', () => {
    const csv = toCsv([aServiceLine()]);
    expect(csv.split('\n')[0]).toBe(SERVICE_LINE_CSV_COLUMNS.join(','));
  });

  it('ends with LF only and contains no carriage returns', () => {
    const csv = toCsv([aServiceLine()]);
    expect(csv.includes('\r')).toBe(false);
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('round trips fields containing commas, double quotes and newlines', () => {
    const line = aServiceLine({
      sourceSystem: 'sys, with comma',
      encounterRef: 'quote "inside" and\nnewline',
      versionRef: 'both, "quoted" and\nbroken'
    });
    const values = rowValues(parseCsv(toCsv([line]))[1] as string[], SERVICE_LINE_CSV_COLUMNS);
    expect(values.sourceSystem).toBe('sys, with comma');
    expect(values.encounterRef).toBe('quote "inside" and\nnewline');
    expect(values.versionRef).toBe('both, "quoted" and\nbroken');
  });

  it('joins modifiers with a pipe and renders dates as YYYY-MM-DD', () => {
    const line = aServiceLine({
      modifiers: ['25', '59', 'XS', 'LT'],
      serviceDate: { year: 2026, month: 2, day: 3 },
      postedDate: { year: 2026, month: 2, day: 4 }
    });
    const values = rowValues(parseCsv(toCsv([line]))[1] as string[], SERVICE_LINE_CSV_COLUMNS);
    expect(values.modifiers).toBe('25|59|XS|LT');
    expect(values.serviceDate).toBe('2026-02-03');
    expect(values.postedDate).toBe('2026-02-04');
  });

  it('writes an empty string for absent optional fields', () => {
    const line = aServiceLine({ versionRef: undefined });
    const values = rowValues(parseCsv(toCsv([line]))[1] as string[], SERVICE_LINE_CSV_COLUMNS);
    expect(values.versionRef).toBe('');
  });
});
