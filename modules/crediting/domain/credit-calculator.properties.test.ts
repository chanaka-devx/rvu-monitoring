import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DecimalValue, DateRange, LocalDate, type DecimalValue as DecimalValueType } from '@rvu/shared-kernel';
import type { ProviderId } from '@rvu/shared-kernel';
import { assignCorrectionPeriod } from './correction-period';
import { decisionToJson } from './credit-decision';
import { decideCredit } from './credit-calculator';
import { decisionToJson } from './credit-decision';
import { CreditingPolicy, type CreditingPolicyConfig } from './crediting-policy';
import type { RvuScheduleView } from './rvu-schedule-view';
import type { ServiceLineVersion } from './service-line-version';
import { normalizeModifiers } from './modifier-rules';

const fcOptions = { numRuns: 500 };

function provider(id: string): ProviderId {
  return id as ProviderId;
}

function decimal(value: string): DecimalValue {
  const parsed = DecimalValue.parse(value);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

function dateOf(year: number, month: number, day: number): LocalDate {
  const parsed = LocalDate.of(year, month, day);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

function baseConfig(): CreditingPolicyConfig {
  return {
    policyId: 'policy-props',
    dateBasis: 'service_date',
    scheduleBasis: { kind: 'service_date' },
    statusRules: { final: 'credit', pending: 'exclude', voided: 'exclude' },
    maxUnitsPerLine: 1000,
    modifiers: { combinations: [], perModifier: {}, scoped: [] },
    correctionRule: 'original_period_while_open'
  };
}

function policyOf(config: CreditingPolicyConfig = baseConfig()): CreditingPolicy {
  const outcome = CreditingPolicy.create(config);
  if (!outcome.ok) {
    throw new Error(outcome.error.message);
  }
  return outcome.value;
}

function lineOf(overrides: {
  code: string;
  providerId: ProviderId | null;
  units: number;
  modifiers: readonly string[];
  status: ServiceLineVersion['status'];
}): ServiceLineVersion {
  return {
    serviceLineId: 'line-1',
    version: 'v1',
    code: overrides.code,
    serviceDate: dateOf(2026, 1, 15),
    postedDate: dateOf(2026, 1, 20),
    providerId: overrides.providerId,
    units: overrides.units,
    modifiers: overrides.modifiers,
    status: overrides.status
  };
}

function scheduleOf(
  values: Readonly<Record<string, DecimalValueType | null>>,
  start: LocalDate,
  end: LocalDate | null,
  versionId: string
): RvuScheduleView {
  const range = DateRange.of(start, end);
  if (!range.ok) {
    throw new Error(range.error.message);
  }
  return {
    versionId,
    effectiveRange: range.value,
    workRvuFor: (code: string) => {
      if (!(code in values)) {
        return { kind: 'unknown_code' } as const;
      }
      const stored = values[code];
      if (stored === undefined || stored === null) {
        return { kind: 'no_value' } as const;
      }
      return { kind: 'value', workRvu: stored } as const;
    }
  };
}

const lineArbitrary = fc
  .record({
    code: fc.constantFrom('99213', '99214', '99241'),
    providerId: fc.option(fc.constant(provider('prov-1')), { nil: null }),
    units: fc.oneof(
      fc.integer({ min: 1, max: 1000 }),
      fc.integer({ min: -2, max: 2 }),
      fc.constant(1.5),
      fc.constant(70000)
    ),
    modifiers: fc.uniqueArray(fc.constantFrom('25', '59', 'ZZ', 'lite'), { maxLength: 3 }),
    status: fc.constantFrom('final', 'pending', 'voided') as fc.Arbitrary<ServiceLineVersion['status']>
  })
  .map((raw): ServiceLineVersion => ({
    serviceLineId: 'line-1',
    version: 'v1',
    code: raw.code,
    serviceDate: dateOf(2026, 1, 15),
    postedDate: dateOf(2026, 1, 20),
    providerId: raw.providerId,
    units: raw.units,
    modifiers: raw.modifiers,
    status: raw.status
  }));

const scheduleArbitrary = fc.oneof(
  fc.constant(null),
  fc.constant(scheduleOf({ '99213': decimal('1.2345'), '99214': null }, dateOf(2026, 1, 1), null, 'sch-2026')),
  fc.constant(scheduleOf({ '99213': decimal('2'), '99214': decimal('3.5') }, dateOf(2025, 1, 1), dateOf(2025, 6, 24), 'sch-2025'))
);

const defaultPolicy = policyOf();

function unitsValue(units: number): DecimalValue {
  const parsed = DecimalValue.fromInteger(units);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

describe('decision properties', () => {
  it('never throws and returns a valid decision kind for arbitrary inputs (P01)', () => {
    fc.assert(
      fc.property(lineArbitrary, scheduleArbitrary, (line, schedule) => {
        const decision = decideCredit(line, schedule, defaultPolicy);
        expect(['Credited', 'NeedsReview', 'Excluded']).toContain(decision.kind);
        expect(decision.policyId).toBe('policy-props');
        expect(decision.trace.creditDate.toString()).toBe('2026-01-15');
        expect(JSON.stringify(decisionToJson(decision)).length).toBeGreaterThan(0);
      }),
      fcOptions
    );
  });

  it('is deterministic: identical inputs give identical decisions (P02)', () => {
    fc.assert(
      fc.property(lineArbitrary, scheduleArbitrary, (line, schedule) => {
        const first = decideCredit(line, schedule, defaultPolicy);
        const second = decideCredit(line, schedule, defaultPolicy);
        expect(JSON.stringify(decisionToJson(first))).toBe(JSON.stringify(decisionToJson(second)));
      }),
      fcOptions
    );
  });

  it('never credits modifiers the policy does not support (P03, non-empty disjoint sets)', () => {
    fc.assert(
      fc.property(lineArbitrary, scheduleArbitrary, (line, schedule) => {
        const normalized = normalizeModifiers(line.modifiers);
        const unsupported = normalized.filter((value) => value !== '25' && value !== '59');
        if (normalized.length === 0 || unsupported.length === 0) {
          return;
        }
        const decision = decideCredit(line, schedule, defaultPolicy);
        expect(['NeedsReview', 'Excluded']).toContain(decision.kind);
      }),
      fcOptions
    );
  });

  it('credits round to four fractional digits, stay non-negative, and fit NUMERIC(12,4) (P04)', () => {
    fc.assert(
      fc.property(fc.nat(99999), fc.integer({ min: 1, max: 1000 }), (workRvuTicks, units) => {
        const workRvu = decimal((workRvuTicks / 100000).toFixed(5));
        const schedule = scheduleOf({ '99213': workRvu }, dateOf(2026, 1, 1), null, 'sch-2026');
        const decision = decideCredit(lineOf({ code: '99213', providerId: provider('prov-1'), units, modifiers: [], status: 'final' }), schedule, defaultPolicy);
        if (decision.kind !== 'Credited') {
          throw new Error(`expected credited decision, got ${decision.kind}`);
        }
        expect(decision.wrvu.isNegative()).toBe(false);
        const roundTrip = DecimalValue.parse(decision.wrvu.toFixed(4));
        expect(roundTrip.ok).toBe(true);
        expect(roundTrip.ok && decision.wrvu.equals(roundTrip.value)).toBe(true);
        expect(decision.wrvu.toNumeric(12, 4).ok).toBe(true);
      }),
      fcOptions
    );
  });

  it('standard credit equals round4(workRvu x units) exactly and is monotone in units (P05)', () => {
    fc.assert(
      fc.property(fc.nat(99999), fc.integer({ min: 1, max: 999 }), (workRvuTicks, units1) => {
        const workRvu = decimal((workRvuTicks / 100000).toFixed(5));
        const schedule = scheduleOf({ '99213': workRvu }, dateOf(2026, 1, 1), null, 'sch-2026');
        const policy = policyOf();
        const units2 = units1 + 1;
        const first = decideCredit(lineOf({ code: '99213', providerId: provider('prov-1'), units: units1, modifiers: [], status: 'final' }), schedule, policy);
        const second = decideCredit(lineOf({ code: '99213', providerId: provider('prov-1'), units: units2, modifiers: [], status: 'final' }), schedule, policy);
        if (first.kind !== 'Credited' || second.kind !== 'Credited') {
          throw new Error('expected credited decisions');
        }
        expect(first.wrvu.toFixed(4)).toBe(workRvu.multiply(unitsValue(units1)).round(4, 'HALF_UP').toFixed(4));
        expect(second.wrvu.compare(first.wrvu)).toBeGreaterThanOrEqual(0);
      }),
      fcOptions
    );
  });

  it('carries the policy id and provider/schedule identity it decided with (P06)', () => {
    fc.assert(
      fc.property(lineArbitrary, scheduleArbitrary, (line, schedule) => {
        const decision = decideCredit(line, schedule, defaultPolicy);
        expect(decision.trace.code).toBe(line.code);
        if (decision.kind === 'Credited') {
          expect(decision.providerId).toBe(line.providerId);
          expect(decision.scheduleVersionId).toBe(schedule === null ? null : schedule.versionId);
        }
      }),
      fcOptions
    );
  });

  it('correction periods adjust exactly when the rule always adjusts or the period is closed (P07)', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (isClosed, alwaysAdjustment) => {
        const rule = alwaysAdjustment ? 'always_adjustment' : 'original_period_while_open';
        const period = assignCorrectionPeriod(rule, isClosed, dateOf(2026, 1, 15), dateOf(2026, 3, 2));
        if (alwaysAdjustment || isClosed) {
          expect(period.kind === 'adjustment' && period.date.toString()).toBe('2026-03-02');
        } else {
          expect(period.kind === 'original' && period.date.toString()).toBe('2026-01-15');
        }
      }),
      fcOptions
    );
  });
});
