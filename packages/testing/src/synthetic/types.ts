import { LocalDate, type DecimalValue, type LocalDate as LocalDateType } from '@rvu/shared-kernel';
import { expectOk } from '../result-helpers';

export type SyntheticDateInput = LocalDateType | { readonly year: number; readonly month: number; readonly day: number } | string;

export interface SyntheticProvider {
  readonly providerId: string;
  readonly displayName: string;
}

export interface SyntheticRvuEntry {
  readonly code: string;
  readonly workRvu: DecimalValue;
  readonly effectiveStart: LocalDateType;
  readonly effectiveEnd: LocalDateType | null;
}

export interface SyntheticServiceLine {
  readonly sourceSystem: string;
  readonly sourceLineId: string;
  readonly encounterRef: string;
  readonly versionRef?: string;
  readonly serviceDate: LocalDateType;
  readonly code: string;
  readonly modifiers: string[];
  readonly units: number;
  readonly placeOfService: string;
  readonly renderingProviderId: string;
  readonly locationId: string;
  readonly status: 'final' | 'pending' | 'voided';
  readonly postedDate: LocalDateType;
}

export function toLocalDate(input: SyntheticDateInput): LocalDateType {
  if (typeof input === 'string') {
    return expectOk(LocalDate.parse(input));
  }
  if ('year' in input) {
    return expectOk(LocalDate.of(input.year, input.month, input.day));
  }
  return input;
}
