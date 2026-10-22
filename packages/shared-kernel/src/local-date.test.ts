import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LocalDate } from './local-date';

const parseOk = (value: string): LocalDate => {
  const result = LocalDate.parse(value);
  if (!result.ok) {
    throw new Error(`expected '${value}' to parse, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

const isErr = { ok: false, error: { kind: 'validation' } };

describe('parse', () => {
  it.each(['2026-01-01', '2026-12-31', '2028-02-29', '2024-02-29', '1000-01-01', '9999-12-31', '0999-12-31'])(
    'accepts %s',
    (value) => {
      const result = LocalDate.parse(value);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.toString()).toBe(value);
      }
    }
  );

  it.each([
    '',
    '2026-1-1',
    '2026/01/01',
    '2026-13-01',
    '2026-00-10',
    '2026-01-00',
    '2026-01-32',
    '2026-04-31',
    '2026-02-29',
    '2027-02-29',
    '2100-02-29',
    '0025-06-15',
    '20260101',
    ' 2026-01-01',
    '2026-01-01 ',
    '2026-01-01T00:00:00Z'
  ])('rejects %s', (value) => {
    expect(LocalDate.parse(value)).toMatchObject(isErr);
  });

  it('rejects a February 29th outside leap years', () => {
    const result = LocalDate.parse('2026-02-29');
    if (!result.ok) {
      expect(result.error.code).toBe('date/invalid-calendar-date');
      expect(result.error.kind).toBe('validation');
      expect(result.error.details).toEqual({ input: '2026-02-29' });
    } else {
      expect.unreachable('2026-02-29 must be rejected');
    }
  });

  it('accepts a February 29th inside leap years', () => {
    expect(LocalDate.parse('2028-02-29').ok).toBe(true);
    expect(LocalDate.parse('2024-02-29').ok).toBe(true);
  });
});

describe('of', () => {
  it('builds a date from parts', () => {
    const date = LocalDate.of(2026, 10, 22);
    expect(date.ok).toBe(true);
    if (date.ok) {
      expect(date.value.toString()).toBe('2026-10-22');
    }
  });

  it('rejects impossible dates', () => {
    expect(LocalDate.of(2026, 13, 1).ok).toBe(false);
    expect(LocalDate.of(2026, 0, 1).ok).toBe(false);
    expect(LocalDate.of(2026, 2, 29).ok).toBe(false);
    expect(LocalDate.of(2028, 2, 29).ok).toBe(true);
    expect(LocalDate.of(2026, 1, 32).ok).toBe(false);
  });
});

describe('fields and toString', () => {
  it('exposes year, month and day', () => {
    const date = parseOk('2026-10-22');
    expect(date.year).toBe(2026);
    expect(date.month).toBe(10);
    expect(date.day).toBe(22);
  });

  it('round trips any generated date through toString', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 9999 }),
        fc.constantFrom(1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
        fc.nat(27),
        (year, month, dayIndex) => {
          const date = parseOk(
            `${year}-${String(month).padStart(2, '0')}-${String(dayIndex + 1).padStart(2, '0')}`
          );
          const reparsed = LocalDate.parse(date.toString());
          if (reparsed.ok) {
            expect(reparsed.value.equals(date)).toBe(true);
            expect(reparsed.value.toString()).toBe(date.toString());
          } else {
            expect.unreachable('a rendered date must parse back');
          }
        }
      )
    );
  });
});

describe('comparison', () => {
  it('orders dates', () => {
    const early = parseOk('2026-01-01');
    const late = parseOk('2026-03-15');
    expect(early.compare(late)).toBe(-1);
    expect(late.compare(early)).toBe(1);
    expect(early.compare(parseOk('2026-01-01'))).toBe(0);
  });

  it('reports before and after', () => {
    const early = parseOk('2026-01-31');
    const late = parseOk('2026-02-01');
    expect(early.isBefore(late)).toBe(true);
    expect(late.isAfter(early)).toBe(true);
    expect(early.isBefore(early)).toBe(false);
    expect(early.isAfter(early)).toBe(false);
  });

  it('equals matching dates only', () => {
    const date = parseOk('2026-10-22');
    expect(date.equals(parseOk('2026-10-22'))).toBe(true);
    expect(date.equals(parseOk('2026-10-23'))).toBe(false);
  });

  it('compares consistently for any pair', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 9999 }),
        fc.constantFrom(1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
        fc.nat(27),
        fc.integer({ min: 1000, max: 9999 }),
        fc.constantFrom(1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
        fc.nat(27),
        (ya, ma, da, yb, mb, db) => {
          const a = LocalDate.of(ya, ma, da + 1);
          const b = LocalDate.of(yb, mb, db + 1);
          if (!a.ok || !b.ok) {
            expect.unreachable('generated dates must be valid');
          }
          if (a.ok && b.ok) {
            const forward = a.value.compare(b.value) < 0;
            const backward = b.value.compare(a.value) < 0;
            expect(forward && backward).toBe(false);
            expect(forward !== backward || a.value.equals(b.value)).toBe(true);
          }
        }
      )
    );
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(parseOk('2026-10-31').addDays(1).toString()).toBe('2026-11-01');
    expect(parseOk('2026-12-31').addDays(1).toString()).toBe('2027-01-01');
    expect(parseOk('2026-02-28').addDays(1).toString()).toBe('2026-03-01');
    expect(parseOk('2028-02-28').addDays(1).toString()).toBe('2028-02-29');
    expect(parseOk('2024-02-29').addDays(1).toString()).toBe('2024-03-01');
  });

  it('moves backwards with negative days', () => {
    expect(parseOk('2027-01-01').addDays(-1).toString()).toBe('2026-12-31');
    expect(parseOk('2026-03-01').addDays(-1).toString()).toBe('2026-02-28');
  });

  it('is invertible for any day offset', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100_000, max: 100_000 }), (offset) => {
        const start = parseOk('2026-06-15');
        expect(start.addDays(offset).addDays(-offset).equals(start)).toBe(true);
      })
    );
  });

  it('commutes with composition', () => {
    fc.assert(
      fc.property(fc.nat(500), fc.nat(500), (a, b) => {
        const start = parseOk('2026-06-15');
        expect(start.addDays(a).addDays(b).toString()).toBe(start.addDays(a + b).toString());
      })
    );
  });
});

describe('month boundaries', () => {
  it('returns the first day of the month', () => {
    expect(parseOk('2026-10-22').startOfMonth().toString()).toBe('2026-10-01');
  });

  it('returns the last day of the month', () => {
    expect(parseOk('2026-10-22').endOfMonth().toString()).toBe('2026-10-31');
    expect(parseOk('2026-02-14').endOfMonth().toString()).toBe('2026-02-28');
    expect(parseOk('2028-02-14').endOfMonth().toString()).toBe('2028-02-29');
    expect(parseOk('2026-04-09').endOfMonth().toString()).toBe('2026-04-30');
    expect(parseOk('2026-01-01').endOfMonth().toString()).toBe('2026-01-31');
  });

  it('lands on its own month boundaries', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 9999 }),
        fc.constantFrom(1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
        fc.nat(26),
        (year, month, dayIndex) => {
          const date = LocalDate.of(year, month, dayIndex + 2);
          if (!date.ok) {
            expect.unreachable('days 1 to 28 are always valid');
          }
          if (date.ok) {
            expect(date.value.startOfMonth().isBefore(date.value)).toBe(true);
            expect(date.value.endOfMonth().isAfter(date.value)).toBe(true);
          }
        }
      )
    );
  });
});

describe('today', () => {
  class FixedClock {
    constructor(private readonly fixed: Date) {}
    now(): Date {
      return this.fixed;
    }
  }

  it('returns the calendar date in UTC', () => {
    const clock = new FixedClock(new Date('2026-10-22T18:45:00Z'));
    expect(LocalDate.today(clock, 'UTC').toString()).toBe('2026-10-22');
  });

  it('uses the requested time zone to derive the date', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:30:00Z'));
    expect(LocalDate.today(clock, 'America/New_York').toString()).toBe('2025-12-31');
    expect(LocalDate.today(clock, 'UTC').toString()).toBe('2026-01-01');
  });

  it('rolls to the next day for far-east zones', () => {
    const clock = new FixedClock(new Date('2026-01-01T15:30:00Z'));
    expect(LocalDate.today(clock, 'Asia/Tokyo').toString()).toBe('2026-01-02');
  });
});
