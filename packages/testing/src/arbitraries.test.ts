import { DecimalValue, LocalDate, type LocalDate as LocalDateType, type DateRange as DateRangeType, type DecimalValue as DecimalValueType } from '@rvu/shared-kernel';
import { decimalArb, dateRangeArb, localDateArb } from './arbitraries';
import fc from 'fast-check';
import { describe, it } from 'vitest';

describe('arbitraries', () => {
  it('decimalArb always produces a valid DecimalValue', () => {
    fc.assert(
      fc.property(decimalArb, (value: DecimalValueType) => {
        const roundTripped = DecimalValue.parse(value.toJSON());
        if (!roundTripped.ok) {
          return false;
        }
        return roundTripped.value.equals(value) && roundTripped.value.toFixed(8) === value.toFixed(8);
      }),
      { numRuns: 500 }
    );
  });

  it('localDateArb only produces years between 2000 and 2100 and round trips through parse', () => {
    fc.assert(
      fc.property(localDateArb, (date: LocalDateType) => {
        const reparsed = LocalDate.parse(date.toString());
        if (!reparsed.ok) {
          return false;
        }
        return reparsed.value.equals(date) && date.year >= 2000 && date.year <= 2100;
      }),
      { numRuns: 500 }
    );
  });

  it('dateRangeArb always yields a range whose start is contained', () => {
    fc.assert(
      fc.property(dateRangeArb, (range: DateRangeType) => {
        return range.contains(range.start);
      }),
      { numRuns: 500 }
    );
  });

  it('dateRangeArb end bounds hold: any date before start is excluded', () => {
    fc.assert(
      fc.property(dateRangeArb, (range: DateRangeType) => {
        return !range.contains(range.start.addDays(-1));
      }),
      { numRuns: 500 }
    );
  });
});
