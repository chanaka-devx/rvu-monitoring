import type { LocalDate } from '@rvu/shared-kernel';
import type { CorrectionRule } from './crediting-policy';

export type CorrectionPeriod =
  | { readonly kind: 'adjustment'; readonly date: LocalDate }
  | { readonly kind: 'original'; readonly date: LocalDate };

export function assignCorrectionPeriod(
  rule: CorrectionRule,
  isClosed: boolean,
  originalCreditDate: LocalDate,
  currentDate: LocalDate
): CorrectionPeriod {
  return rule === 'always_adjustment' || isClosed
    ? { kind: 'adjustment', date: currentDate }
    : { kind: 'original', date: originalCreditDate };
}
