import type { DecimalValue } from '@rvu/shared-kernel';
import type { DateRange } from '@rvu/shared-kernel';

export interface RvuScheduleView {
  readonly versionId: string;
  readonly effectiveRange: DateRange;

  workRvuFor(code: string): WorkRvuLookup;
}

export type WorkRvuLookup =
  | { readonly kind: 'value'; readonly workRvu: DecimalValue }
  | { readonly kind: 'no_value' }
  | { readonly kind: 'unknown_code' };
