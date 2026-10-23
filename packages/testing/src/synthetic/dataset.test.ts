import { LocalDate } from '@rvu/shared-kernel';
import { expectOk } from '../result-helpers';
import { toCsv } from './csv';
import { generateDataset } from './dataset';
import { describe, expect, it } from 'vitest';

const DEFAULT_START = expectOk(LocalDate.parse('2026-01-01'));

const csvOf = (options: Parameters<typeof generateDataset>[0]): string => toCsv(generateDataset(options).lines);

function daysFromStart(date: LocalDate, start: LocalDate): number {
  return Math.round(
    (Date.UTC(date.year, date.month - 1, date.day) - Date.UTC(start.year, start.month - 1, start.day)) / 86_400_000
  );
}

describe('generateDataset', () => {
  it('is fully determined by the seed (identical CSV strings)', () => {
    expect(csvOf({ seed: 1234, providers: 3, days: 5, linesPerDay: 4 })).toBe(
      csvOf({ seed: 1234, providers: 3, days: 5, linesPerDay: 4 })
    );
  });

  it('differs across seeds', () => {
    expect(csvOf({ seed: 1, providers: 3, days: 10, linesPerDay: 6 })).not.toBe(
      csvOf({ seed: 2, providers: 3, days: 10, linesPerDay: 6 })
    );
  });

  it('keeps the requested counts for different sizes', () => {
    const small = generateDataset({ seed: 7, providers: 2, days: 3, linesPerDay: 2 });
    expect(small.providers).toHaveLength(2);
    expect(small.lines).toHaveLength(3 * 2);
    expect(small.lines.every((line) => daysFromStart(line.serviceDate, DEFAULT_START) < 3)).toBe(true);

    const large = generateDataset({ seed: 7, providers: 5, days: 9, linesPerDay: 7 });
    expect(large.providers).toHaveLength(5);
    expect(large.lines).toHaveLength(9 * 7);
    expect(large.lines.every((line) => daysFromStart(line.serviceDate, DEFAULT_START) < 9)).toBe(true);
  });

  it('uses a fixed default start date', () => {
    const { lines } = generateDataset({ seed: 3, providers: 1, days: 1, linesPerDay: 1 });
    expect(lines[0]?.serviceDate.equals(DEFAULT_START)).toBe(true);
  });

  it('honors an explicit startDate', () => {
    const { lines } = generateDataset({ seed: 4, providers: 1, days: 4, linesPerDay: 2, startDate: '2025-07-01' });
    const earliest = lines.map((line) => line.serviceDate.toString()).sort()[0];
    expect(earliest).toBe('2025-07-01');
  });

  it('only produces synthetic Z-codes within Z0001..Z0099', () => {
    const { lines, rvuEntries } = generateDataset({ seed: 21, providers: 3, days: 6, linesPerDay: 5 });
    for (const line of lines) {
      const numeric = /^Z(\d{4})$/.exec(line.code);
      expect(numeric).not.toBeNull();
      const index = Number(numeric?.[1]);
      expect(index).toBeGreaterThanOrEqual(1);
      expect(index).toBeLessThanOrEqual(99);
    }
    for (const entry of rvuEntries) {
      const numeric = /^Z(\d{4})$/.exec(entry.code);
      expect(numeric).not.toBeNull();
    }
  });

  it('only assigns line codes that exist in the rvu entries', () => {
    const { lines, rvuEntries } = generateDataset({ seed: 21, providers: 2, days: 4, linesPerDay: 3 });
    const known = new Set(rvuEntries.map((entry) => entry.code));
    for (const line of lines) {
      expect(known.has(line.code)).toBe(true);
    }
  });

  it('references existing providers by id', () => {
    const { providers, lines } = generateDataset({ seed: 5, providers: 4, days: 3, linesPerDay: 3 });
    const ids = new Set(providers.map((provider) => provider.providerId));
    for (const line of lines) {
      expect(ids.has(line.renderingProviderId)).toBe(true);
    }
  });

  it('posts every line at most two days after its service date', () => {
    const { lines } = generateDataset({ seed: 8, providers: 2, days: 6, linesPerDay: 4 });
    for (const line of lines) {
      expect(line.postedDate.isBefore(line.serviceDate)).toBe(false);
      expect(daysFromStart(line.postedDate, line.serviceDate)).toBeLessThanOrEqual(2);
    }
  });

  it('contains no patient-like values anywhere in the CSV', () => {
    const csv = csvOf({ seed: 6, providers: 3, days: 4, linesPerDay: 5 });
    expect(csv).not.toMatch(/patient|dob|birth|mrn|insurance/i);
  });
});
