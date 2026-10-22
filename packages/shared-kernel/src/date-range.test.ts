import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DateRange } from './date-range';
import { LocalDate } from './local-date';

const parseOk = (value: string): LocalDate => {
  const result = LocalDate.parse(value);
  if (!result.ok) {
    throw new Error(`expected '${value}' to parse, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

const rangeOk = (start: string, end: string | null): DateRange => {
  const result = DateRange.of(parseOk(start), end === null ? null : parseOk(end));
  if (!result.ok) {
    throw new Error(`expected range ${start}..${end}, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

const isErr = { ok: false, error: { kind: 'validation' } };

describe('of', () => {
  it('builds a bounded range', () => {
    const range = rangeOk('2026-01-01', '2026-02-01');
    expect(range.start.equals(parseOk('2026-01-01'))).toBe(true);
    expect(range.end).not.toBeNull();
    if (range.end) {
      expect(range.end.equals(parseOk('2026-02-01'))).toBe(true);
    }
  });

  it('builds an open-ended range', () => {
    const range = rangeOk('2026-01-01', null);
    expect(range.end).toBeNull();
  });

  it('rejects an inverted range', () => {
    expect(DateRange.of(parseOk('2026-02-01'), parseOk('2026-01-01'))).toMatchObject(isErr);
  });

  it('rejects start equal to end', () => {
    const result = DateRange.of(parseOk('2026-02-01'), parseOk('2026-02-01'));
    if (!result.ok) {
      expect(result.error.code).toBe('range/invalid-order');
      expect(result.error.kind).toBe('validation');
    } else {
      expect.unreachable('equal bounds must be rejected');
    }
  });
});

describe('contains', () => {
  it('holds for a bounded half-open range', () => {
    const range = rangeOk('2026-01-01', '2026-02-01');
    expect(range.contains(parseOk('2026-01-01'))).toBe(true);
    expect(range.contains(parseOk('2026-01-31'))).toBe(true);
    expect(range.contains(parseOk('2026-02-01'))).toBe(false);
    expect(range.contains(parseOk('2025-12-31'))).toBe(false);
  });

  it('holds for an open-ended range', () => {
    const range = rangeOk('2026-01-01', null);
    expect(range.contains(parseOk('2026-01-01'))).toBe(true);
    expect(range.contains(parseOk('2099-12-31'))).toBe(true);
    expect(range.contains(parseOk('2025-12-31'))).toBe(false);
  });
});

describe('overlaps', () => {
  it('keeps adjacent half-open ranges apart', () => {
    const january = rangeOk('2026-01-01', '2026-02-01');
    const february = rangeOk('2026-02-01', '2026-03-01');
    expect(january.overlaps(february)).toBe(false);
    expect(february.overlaps(january)).toBe(false);
  });

  it('detects overlapping ranges in both directions', () => {
    const january = rangeOk('2026-01-01', '2026-02-01');
    const midJanuary = rangeOk('2026-01-15', '2026-02-15');
    expect(january.overlaps(midJanuary)).toBe(true);
    expect(midJanuary.overlaps(january)).toBe(true);
  });

  it('detects containment both ways', () => {
    const outer = rangeOk('2026-01-01', '2026-12-31');
    const inner = rangeOk('2026-06-01', '2026-06-30');
    expect(outer.overlaps(inner)).toBe(true);
    expect(inner.overlaps(outer)).toBe(true);
  });

  it('keeps disjoint ranges apart', () => {
    const january = rangeOk('2026-01-01', '2026-02-01');
    const march = rangeOk('2026-03-01', '2026-04-01');
    expect(january.overlaps(march)).toBe(false);
    expect(march.overlaps(january)).toBe(false);
  });

  it('treats open-ended ranges as infinite', () => {
    const started = rangeOk('2026-01-01', null);
    const later = rangeOk('2099-01-01', '2099-02-01');
    expect(started.overlaps(later)).toBe(true);
    expect(later.overlaps(started)).toBe(true);
    const earlier = rangeOk('2020-01-01', '2020-02-01');
    expect(started.overlaps(earlier)).toBe(false);
  });

  it('is symmetric for any pair of ranges', () => {
    const offsets = fc.integer({ min: 0, max: 400 });
    fc.assert(
      fc.property(offsets, offsets, offsets, offsets, offsets, offsets, (s1, e1, s2, e2, g1, g2) => {
        const base = parseOk('2026-06-15');
        const first = DateRange.of(base.addDays(s1), base.addDays(s1 + e1 + g1 + 1));
        const second = DateRange.of(base.addDays(s2), base.addDays(s2 + e2 + g2 + 1));
        if (!first.ok || !second.ok) {
          expect.unreachable('generated ranges must be valid');
        }
        if (first.ok && second.ok) {
          expect(first.value.overlaps(second.value)).toBe(second.value.overlaps(first.value));
        }
      })
    );
  });
});

describe('intersection', () => {
  it('returns the overlapping part', () => {
    const first = rangeOk('2026-01-01', '2026-02-01');
    const second = rangeOk('2026-01-15', '2026-02-15');
    const overlap = first.intersection(second);
    expect(overlap).not.toBeNull();
    if (overlap) {
      expect(overlap.start.equals(parseOk('2026-01-15'))).toBe(true);
      if (overlap.end) {
        expect(overlap.end.equals(parseOk('2026-02-01'))).toBe(true);
      }
    }
  });

  it('returns null for adjacent ranges', () => {
    expect(rangeOk('2026-01-01', '2026-02-01').intersection(rangeOk('2026-02-01', '2026-03-01')))
      .toBeNull();
  });

  it('returns null for disjoint ranges', () => {
    expect(rangeOk('2026-01-01', '2026-02-01').intersection(rangeOk('2026-03-01', '2026-04-01')))
      .toBeNull();
  });

  it('intersects with open-ended ranges', () => {
    const overlap = rangeOk('2026-01-01', null).intersection(rangeOk('2026-03-01', '2026-04-01'));
    expect(overlap).not.toBeNull();
    if (overlap) {
      expect(overlap.start.equals(parseOk('2026-03-01'))).toBe(true);
      if (overlap.end) {
        expect(overlap.end.equals(parseOk('2026-04-01'))).toBe(true);
      }
    }
    const back = rangeOk('2026-03-01', '2026-04-01').intersection(rangeOk('2026-01-01', null));
    expect(back).not.toBeNull();
    if (back) {
      expect(back.start.equals(parseOk('2026-03-01'))).toBe(true);
    }
  });

  it('intersects two open-ended ranges', () => {
    const overlap = rangeOk('2026-01-01', null).intersection(rangeOk('2026-03-01', null));
    expect(overlap).not.toBeNull();
    if (overlap) {
      expect(overlap.start.equals(parseOk('2026-03-01'))).toBe(true);
      expect(overlap.end).toBeNull();
    }
  });

  it('returns an intersection only when the ranges overlap', () => {
    fc.assert(
      fc.property(offsetsArb(), offsetsArb(), offsetsArb(), offsetsArb(), (s1, e1, s2, e2) => {
        const base = parseOk('2026-06-15');
        const firstResult = DateRange.of(base.addDays(s1), base.addDays(s1 + e1 + 1));
        const secondResult = DateRange.of(base.addDays(s2), base.addDays(s2 + e2 + 1));
        if (!firstResult.ok || !secondResult.ok) {
          expect.unreachable('generated ranges must be valid');
        }
        if (firstResult.ok && secondResult.ok) {
          const overlaps = firstResult.value.overlaps(secondResult.value);
          const intersection = firstResult.value.intersection(secondResult.value);
          expect(intersection !== null).toBe(overlaps);
        }
      })
    );
  });
});

const offsetsArb = (): fc.Arbitrary<number> => fc.integer({ min: 0, max: 400 });
