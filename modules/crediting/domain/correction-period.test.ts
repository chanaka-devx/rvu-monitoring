import { describe, expect, it } from 'vitest';
import { LocalDate } from '@rvu/shared-kernel';
import { assignCorrectionPeriod } from './correction-period';

function dateOf(year: number, month: number, day: number): LocalDate {
  const parsed = LocalDate.of(year, month, day);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

describe('assignCorrectionPeriod', () => {
  it('lands in the original period while it is open', () => {
    const period = assignCorrectionPeriod('original_period_while_open', false, dateOf(2026, 1, 15), dateOf(2026, 3, 2));
    expect(period).toEqual({ kind: 'original', date: dateOf(2026, 1, 15) });
  });

  it('lands as an adjustment in the current period once the original is closed', () => {
    const period = assignCorrectionPeriod('original_period_while_open', true, dateOf(2026, 1, 15), dateOf(2026, 3, 2));
    expect(period).toEqual({ kind: 'adjustment', date: dateOf(2026, 3, 2) });
  });

  it('always lands as an adjustment under always_adjustment', () => {
    const closedPeriod = assignCorrectionPeriod('always_adjustment', true, dateOf(2026, 1, 15), dateOf(2026, 3, 2));
    const openPeriod = assignCorrectionPeriod('always_adjustment', false, dateOf(2026, 1, 15), dateOf(2026, 3, 2));
    expect(closedPeriod).toEqual({ kind: 'adjustment', date: dateOf(2026, 3, 2) });
    expect(openPeriod).toEqual({ kind: 'adjustment', date: dateOf(2026, 3, 2) });
  });
});
