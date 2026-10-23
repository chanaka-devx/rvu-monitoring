import fc from 'fast-check';
import { DateRange, DecimalValue, LocalDate, type DecimalValue as DecimalValueType, type DateRange as DateRangeType, type LocalDate as LocalDateType } from '@rvu/shared-kernel';
import { expectOk } from './result-helpers';

const MAX_YEAR = 2100;
const MIN_YEAR = 2000;

export const decimalArb: fc.Arbitrary<DecimalValueType> = fc
  .record({
    negative: fc.boolean(),
    integer: fc.integer({ min: 0, max: 999_999_999_999 }),
    fraction: fc.integer({ min: 0, max: 999_999 })
  })
  .map(({ negative, integer, fraction }) => `${negative ? '-' : ''}${integer}.${String(fraction).padStart(6, '0')}`)
  .map((text) => expectOk(DecimalValue.parse(text)));

export const localDateArb: fc.Arbitrary<LocalDateType> = fc
  .record({
    year: fc.integer({ min: MIN_YEAR, max: MAX_YEAR }),
    month: fc.integer({ min: 1, max: 12 }),
    dayCandidate: fc.integer({ min: 1, max: 31 })
  })
  .map(({ year, month, dayCandidate }) => {
    const firstOfMonth = expectOk(LocalDate.of(year, month, 1));
    const dayOfMonth = Math.min(dayCandidate, firstOfMonth.endOfMonth().day);
    return expectOk(LocalDate.of(year, month, dayOfMonth));
  });

export const dateRangeArb: fc.Arbitrary<DateRangeType> = fc
  .record({
    start: localDateArb,
    offset: fc.integer({ min: 1, max: 365 }),
    openEnded: fc.boolean()
  })
  .map(({ start, offset, openEnded }) => expectOk(DateRange.of(start, openEnded ? null : start.addDays(offset))));
