import { DecimalValue, LocalDate, type DecimalValue as DecimalValueType } from '@rvu/shared-kernel';
import { expectOk } from './result-helpers';
import type { SyntheticProvider, SyntheticRvuEntry, SyntheticServiceLine } from './synthetic/types';

export interface BriefResolution {
  readonly sourceLineId: string;
  readonly reviewReason: string;
  readonly outcome:
    | { readonly kind: 'credited'; readonly wrvu: DecimalValueType }
    | { readonly kind: 'excluded'; readonly reason: string };
}

export interface BriefExpected {
  readonly confirmedWrvu: DecimalValueType;
  readonly percentOfTarget: DecimalValueType;
  readonly unresolved: number;
  readonly adjustmentWrvu: DecimalValueType;
  readonly excludedLines: number;
}

export interface BriefScenario {
  readonly provider: SyntheticProvider;
  readonly providerTarget: DecimalValueType;
  readonly rvuEntries: SyntheticRvuEntry[];
  readonly lines: SyntheticServiceLine[];
  readonly resolutions: BriefResolution[];
  readonly expected: { readonly before: BriefExpected; readonly after: BriefExpected };
}

const provider: SyntheticProvider = {
  providerId: 'provider-0001',
  displayName: 'Provider 1'
};

const providerTarget = expectOk(DecimalValue.parse('500'));
const effectiveStart = expectOk(LocalDate.of(2026, 1, 1));

const rvuEntries: SyntheticRvuEntry[] = [
  {
    code: 'Z0003',
    workRvu: expectOk(DecimalValue.parse('3.0')),
    effectiveStart,
    effectiveEnd: null
  },
  {
    code: 'Z0001',
    workRvu: expectOk(DecimalValue.parse('2.0')),
    effectiveStart,
    effectiveEnd: null
  }
];

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function confirmedLine(index: number): SyntheticServiceLine {
  const serviceDate = effectiveStart.addDays(4 + index * 2);
  const marker = `confirmed-${pad(index + 1, 4)}`;
  return {
    sourceSystem: 'synthetic-emr',
    sourceLineId: `line-${marker}`,
    encounterRef: `enc-${marker}`,
    versionRef: '1',
    serviceDate,
    code: 'Z0003',
    modifiers: [],
    units: 2,
    placeOfService: '11',
    renderingProviderId: provider.providerId,
    locationId: 'loc-0001',
    status: 'final',
    postedDate: serviceDate.addDays(1)
  };
}

function makeReviewLine(suffix: string, dayOffset: number): SyntheticServiceLine {
  const serviceDate = effectiveStart.addDays(dayOffset);
  const marker = `review-${suffix}`;
  return {
    sourceSystem: 'synthetic-emr',
    sourceLineId: `line-${marker}`,
    encounterRef: `enc-${marker}`,
    versionRef: '1',
    serviceDate,
    code: 'Z0001',
    modifiers: [],
    units: 2,
    placeOfService: '11',
    renderingProviderId: provider.providerId,
    locationId: 'loc-0001',
    status: 'pending',
    postedDate: serviceDate.addDays(1)
  };
}

function workRvuOf(line: SyntheticServiceLine): DecimalValueType {
  const entry = rvuEntries.find((candidate) => candidate.code === line.code);
  if (entry === undefined) {
    throw new Error(`no rvu entry for code ${line.code}`);
  }
  return entry.workRvu.multiply(expectOk(DecimalValue.fromInteger(line.units)));
}

const lines: SyntheticServiceLine[] = [
  ...Array.from({ length: 60 }, (_unused, index: number) => confirmedLine(index)),
  makeReviewLine('modifier', 6),
  makeReviewLine('no-value', 8),
  makeReviewLine('provider', 10)
];

const resolutions: BriefResolution[] = [
  {
    sourceLineId: 'line-review-modifier',
    reviewReason: 'modifier-not-supported',
    outcome: { kind: 'credited', wrvu: expectOk(DecimalValue.parse('4')) }
  },
  {
    sourceLineId: 'line-review-no-value',
    reviewReason: 'no-rvu-value',
    outcome: { kind: 'credited', wrvu: expectOk(DecimalValue.parse('4')) }
  },
  {
    sourceLineId: 'line-review-provider',
    reviewReason: 'provider-unmatched',
    outcome: { kind: 'excluded', reason: 'duplicate-of-existing-credit' }
  }
];

const confirmedWrvuBefore = DecimalValue.sum(
  lines.filter((line) => line.status === 'final').map(workRvuOf)
);

const creditedWrvu = DecimalValue.sum(
  resolutions.flatMap((resolution) =>
    resolution.outcome.kind === 'credited' ? [resolution.outcome.wrvu] : []
  )
);

const expected = {
  before: {
    confirmedWrvu: confirmedWrvuBefore,
    percentOfTarget: expectOk(confirmedWrvuBefore.percentOf(providerTarget, 2)),
    unresolved: 3,
    adjustmentWrvu: DecimalValue.zero(),
    excludedLines: 0
  },
  after: {
    confirmedWrvu: confirmedWrvuBefore.add(creditedWrvu),
    percentOfTarget: expectOk(
      confirmedWrvuBefore.add(creditedWrvu).percentOf(providerTarget, 2)
    ),
    unresolved: 0,
    adjustmentWrvu: creditedWrvu,
    excludedLines: 1
  }
} as { before: BriefExpected; after: BriefExpected };

export const briefScenario: BriefScenario = {
  provider,
  providerTarget,
  rvuEntries,
  lines,
  resolutions,
  expected
};

export { lines, resolutions, expected };
