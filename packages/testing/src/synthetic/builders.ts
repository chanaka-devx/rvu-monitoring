import { DecimalValue, type LocalDate as LocalDateType } from '@rvu/shared-kernel';
import { expectOk } from '../result-helpers';
import { LocalDate } from '@rvu/shared-kernel';
import { toLocalDate, type SyntheticDateInput, type SyntheticProvider, type SyntheticRvuEntry, type SyntheticServiceLine } from './types';

type BuilderOverrides<T> = { [K in keyof T]?: T[K] | undefined };

const DEFAULT_START = expectOk(LocalDate.of(2026, 1, 1));

export const DEFAULT_SOURCE_SYSTEM = 'synthetic-emr';
export const DEFAULT_LOCATION_ID = 'loc-0001';
export const DEFAULT_PROVIDER_ID = 'provider-0001';

export function aProvider(overrides: BuilderOverrides<SyntheticProvider> = {}): SyntheticProvider {
  const providerId = overrides.providerId ?? DEFAULT_PROVIDER_ID;
  return {
    providerId,
    displayName: overrides.displayName ?? `Provider ${providerId}`
  };
}

export function anRvuEntry(
  overrides: {
    readonly code?: string | undefined;
    readonly workRvu?: DecimalValue | undefined;
    readonly workRvuString?: string | undefined;
    readonly effectiveStart?: SyntheticDateInput | undefined;
    readonly effectiveEnd?: LocalDateType | null | undefined;
  } = {}
): SyntheticRvuEntry {
  return {
    code: overrides.code ?? 'Z0001',
    workRvu: overrides.workRvu ?? expectOk(DecimalValue.parse(overrides.workRvuString ?? '2.50')),
    effectiveStart: toLocalDate(overrides.effectiveStart ?? DEFAULT_START),
    effectiveEnd: overrides.effectiveEnd === undefined ? null : overrides.effectiveEnd
  };
}

export function aServiceLine(
  overrides: {
    readonly sourceSystem?: string | undefined;
    readonly sourceLineId?: string | undefined;
    readonly encounterRef?: string | undefined;
    readonly versionRef?: string | undefined;
    readonly serviceDate?: SyntheticDateInput | undefined;
    readonly code?: string | undefined;
    readonly modifiers?: string[] | undefined;
    readonly units?: number | undefined;
    readonly placeOfService?: string | undefined;
    readonly renderingProviderId?: string | undefined;
    readonly locationId?: string | undefined;
    readonly status?: SyntheticServiceLine['status'] | undefined;
    readonly postedDate?: SyntheticDateInput | undefined;
  } = {}
): SyntheticServiceLine {
  const versionRef = 'versionRef' in overrides ? overrides.versionRef : '1';
  return {
    sourceSystem: overrides.sourceSystem ?? DEFAULT_SOURCE_SYSTEM,
    sourceLineId: overrides.sourceLineId ?? 'line-0001',
    encounterRef: overrides.encounterRef ?? 'enc-0001',
    ...(versionRef === undefined ? {} : { versionRef }),
    serviceDate: toLocalDate(overrides.serviceDate ?? DEFAULT_START),
    code: overrides.code ?? 'Z0001',
    modifiers: overrides.modifiers ?? [],
    units: overrides.units ?? 1,
    placeOfService: overrides.placeOfService ?? '11',
    renderingProviderId: overrides.renderingProviderId ?? DEFAULT_PROVIDER_ID,
    locationId: overrides.locationId ?? DEFAULT_LOCATION_ID,
    status: overrides.status ?? 'final',
    postedDate: toLocalDate(overrides.postedDate ?? DEFAULT_START)
  };
}
