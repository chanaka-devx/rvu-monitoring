import { describe, expect, it } from 'vitest';
import { DecimalValue, DateRange, LocalDate } from '@rvu/shared-kernel';
import type { ProviderId } from '@rvu/shared-kernel';
import type { RvuScheduleView, ServiceLineVersion } from './index';
import { decideCredit } from './credit-calculator';
import { CreditingPolicy } from './crediting-policy';
import { defaultPolicy } from './default-policy';

function provider(id: string): ProviderId {
  return id as ProviderId;
}

function date(year: number, month: number, day: number): LocalDate {
  const parsed = LocalDate.of(year, month, day);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

function decimal(value: string): DecimalValue {
  const parsed = DecimalValue.parse(value);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

interface LineOverrides {
  readonly serviceLineId?: string;
  readonly version?: string;
  readonly code?: string;
  readonly serviceDate?: LocalDate;
  readonly postedDate?: LocalDate;
  readonly providerId?: ProviderId | null;
  readonly units?: number;
  readonly modifiers?: readonly string[];
  readonly status?: ServiceLineVersion['status'];
}

function lineOf(overrides: LineOverrides = {}): ServiceLineVersion {
  const defaults: ServiceLineVersion = {
    serviceLineId: 'line-1',
    version: 'v1',
    code: '99213',
    serviceDate: date(2026, 1, 15),
    postedDate: date(2026, 1, 20),
    providerId: provider('prov-1'),
    units: 1,
    modifiers: [],
    status: 'final'
  };
  const merged: ServiceLineVersion = {
    serviceLineId: overrides.serviceLineId === undefined ? defaults.serviceLineId : overrides.serviceLineId,
    version: overrides.version === undefined ? defaults.version : overrides.version,
    code: overrides.code === undefined ? defaults.code : overrides.code,
    serviceDate: overrides.serviceDate === undefined ? defaults.serviceDate : overrides.serviceDate,
    postedDate: overrides.postedDate === undefined ? defaults.postedDate : overrides.postedDate,
    providerId: overrides.providerId === undefined ? defaults.providerId : overrides.providerId,
    units: overrides.units === undefined ? defaults.units : overrides.units,
    modifiers: overrides.modifiers === undefined ? defaults.modifiers : overrides.modifiers,
    status: overrides.status === undefined ? defaults.status : overrides.status
  };
  return merged;
}

function unwrapped<T>(result: { readonly ok: boolean; readonly value: T; readonly error?: { readonly message: string } }): T {
  if (!result.ok) {
    throw new Error(result.error?.message ?? 'unexpected error');
  }
  return result.value;
}

function dateRange(start: LocalDate, end: LocalDate | null): DateRange {
  return unwrapped(DateRange.of(start, end));
}

interface ScheduleOverrides {
  readonly versionId?: string;
  readonly start?: LocalDate;
  readonly end?: LocalDate | null;
  readonly values?: Readonly<Record<string, DecimalValue | null>>;
}

function scheduleOf(overrides: ScheduleOverrides = {}): RvuScheduleView {
  return {
    versionId: overrides.versionId === undefined ? 'sch-2026' : overrides.versionId,
    effectiveRange: dateRange(overrides.start === undefined ? date(2026, 1, 1) : overrides.start, overrides.end === undefined ? null : overrides.end),
    workRvuFor: (code: string) => {
      const values = overrides.values === undefined ? { '99213': decimal('3.0') } : overrides.values;
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

function testPolicy(): CreditingPolicy {
  return unwrapped(
    CreditingPolicy.create({
      policyId: 'policy-1',
      dateBasis: 'service_date',
      scheduleBasis: { kind: 'service_date' },
      statusRules: { final: 'credit', pending: 'exclude', voided: 'exclude' },
      maxUnitsPerLine: 1000,
      modifiers: { combinations: [], perModifier: {}, scoped: [] },
      correctionRule: 'original_period_while_open'
    })
  );
}

describe('credit calculator golden cases', () => {
  it('multiplies work RVU by units and applies the policy factor', () => {
    const decision = decideCredit(lineOf({ units: 2 }), scheduleOf({ values: { '99213': decimal('3.0') } }), testPolicy());
    expect(decision.kind).toBe('Credited');
    expect(decision.kind === 'Credited' && decision.wrvu.toFixed(4)).toBe('6.0000');
    expect(decision.kind === 'Credited' && decision.rule).toBe('standard');
  });

  it('rounds half up exactly once at scale four', () => {
    const decision = decideCredit(lineOf({ units: 1 }), scheduleOf({ values: { '99213': decimal('1.23455') } }), testPolicy());
    expect(decision.kind === 'Credited' && decision.wrvu.toFixed(4)).toBe('1.2346');
  });

  it('ties at half up round away from zero at scale four', () => {
    const halfUp = decideCredit(lineOf({ units: 1 }), scheduleOf({ values: { '99213': decimal('0.00005') } }), testPolicy());
    expect(halfUp.kind === 'Credited' && halfUp.wrvu.toFixed(4)).toBe('0.0001');
    const roundDown = decideCredit(lineOf({ units: 1 }), scheduleOf({ values: { '99213': decimal('0.00004') } }), testPolicy());
    expect(roundDown.kind === 'Credited' && roundDown.wrvu.toFixed(4)).toBe('0.0000');
  });

  it('credits true zero schedules as zero wrvu', () => {
    const decision = decideCredit(lineOf({}), scheduleOf({ values: { '99213': decimal('0') } }), testPolicy());
    expect(decision.kind).toBe('Credited');
    expect(decision.kind === 'Credited' && decision.wrvu.toFixed(4)).toBe('0.0000');
  });
});

describe('credit calculator status and gating', () => {
  it('excludes by status before every other rule even when the provider is unmapped', () => {
    const decision = decideCredit(lineOf({ status: 'voided', providerId: null }), scheduleOf({}), testPolicy());
    expect(decision.kind === 'Excluded' && decision.reason).toBe('status_excluded');
  });

  it('reviews pending status by the status rule', () => {
    const pendingReview = unwrapped(
      CreditingPolicy.create({ ...testPolicy().config, statusRules: { final: 'credit', pending: 'review', voided: 'exclude' } })
    );
    const decision = decideCredit(lineOf({ status: 'pending' }), scheduleOf({}), pendingReview);
    expect(decision.kind === 'NeedsReview' && decision.reason).toBe('status_requires_review');
  });

  it('reviews unmapped providers for creditable status', () => {
    const decision = decideCredit(lineOf({ providerId: null }), scheduleOf({}), testPolicy());
    expect(decision.kind === 'NeedsReview' && decision.reason).toBe('provider_unmapped');
  });

  it('reviews units outside the integer range including the boundary', () => {
    for (const units of [0, -1, 1.5, 1001, Number.NaN, Infinity]) {
      const decision = decideCredit(lineOf({ units }), scheduleOf({}), testPolicy());
      expect(decision.kind === 'NeedsReview' && decision.reason).toBe('invalid_units');
    }
    const boundary = decideCredit(lineOf({ units: 1000 }), scheduleOf({ values: { '99213': decimal('3') } }), testPolicy());
    expect(boundary.kind).toBe('Credited');
  });

  it('reviews missing schedules after modifier checks', () => {
    const decision = decideCredit(lineOf({}), null, testPolicy());
    expect(decision.kind === 'NeedsReview' && decision.reason).toBe('no_schedule_available');
  });

  it('reviews codes missing from the schedule', () => {
    const decision = decideCredit(lineOf({ code: '99214' }), scheduleOf({}), testPolicy());
    expect(decision.kind === 'NeedsReview' && decision.reason).toBe('code_not_in_schedule');
  });

  it('reviews schedule rows without an RVU value', () => {
    const decision = decideCredit(lineOf({}), scheduleOf({ values: { '99213': null } }), testPolicy());
    expect(decision.kind === 'NeedsReview' && decision.reason).toBe('no_rvu_value');
  });

  it('reviews when the schedule does not cover the selected date', () => {
    const decision = decideCredit(lineOf({}), scheduleOf({ start: date(2027, 1, 1) }), testPolicy());
    expect(decision.kind === 'NeedsReview' && decision.reason).toBe('schedule_mismatch');
  });

  it('reviews when a fixed basis points at a different schedule version', () => {
    const fixed = unwrapped(
      CreditingPolicy.create({
        policyId: 'policy-1',
        dateBasis: 'service_date',
        scheduleBasis: { kind: 'fixed', scheduleVersionId: 'sch-2025' },
        statusRules: { final: 'credit', pending: 'exclude', voided: 'exclude' },
        maxUnitsPerLine: 1000,
        modifiers: { combinations: [], perModifier: {}, scoped: [] },
        correctionRule: 'original_period_while_open'
      })
    );
    const decision = decideCredit(lineOf({}), scheduleOf({}), fixed);
    expect(decision.kind === 'NeedsReview' && decision.reason).toBe('schedule_mismatch');
  });
});

describe('credit calculator dates and identity', () => {
  it('uses the service date as credit date by default', () => {
    const decision = decideCredit(lineOf({}), scheduleOf({}), testPolicy());
    expect(decision.creditDate.toString()).toBe('2026-01-15');
  });

  it('uses the posting date when the policy basis is posting_date', () => {
    const posting = unwrapped(CreditingPolicy.fromJson(testPolicy().toCanonical()));
    const withPosting = unwrapped(
      CreditingPolicy.create({ ...posting.config, dateBasis: 'posting_date' })
    );
    const decision = decideCredit(lineOf({}), scheduleOf({}), withPosting);
    expect(decision.creditDate.toString()).toBe('2026-01-20');
  });

  it('selects the schedule by service date even when the credit date basis is posting date', () => {
    const withPosting = unwrapped(
      CreditingPolicy.create({ ...testPolicy().config, dateBasis: 'posting_date' })
    );
    const narrow = scheduleOf({ start: date(2026, 1, 1), end: date(2026, 1, 16) });
    const decision = decideCredit(lineOf({}), narrow, withPosting);
    expect(decision.kind).toBe('Credited');
  });

  it('carries policy, provider, schedule, and trace data on credited decisions', () => {
    const decision = decideCredit(lineOf({}), scheduleOf({}), testPolicy());
    if (decision.kind !== 'Credited') {
      throw new Error('expected credited decision');
    }
    expect(decision.policyId).toBe('policy-1');
    expect(decision.providerId).toBe(provider('prov-1'));
    expect(decision.scheduleVersionId).toBe('sch-2026');
    expect(decision.trace.code).toBe('99213');
    expect(decision.trace.status).toBe('final');
    expect(decision.trace.workRvu?.toFixed(4)).toBe('3.0000');
  });
});

describe('credit calculator modifiers', () => {
  it('excludes through modifier rules before schedule lookups', () => {
    const policy = unwrapped(
      CreditingPolicy.create({ ...testPolicy().config, modifiers: { combinations: [], perModifier: { '59': { kind: 'exclude', reason: 'consult not payable' } }, scoped: [] } })
    );
    const decision = decideCredit(lineOf({ modifiers: [' 59 '] }), null, policy);
    expect(decision.kind === 'Excluded' && decision.reason).toBe('modifier_excluded');
    expect(decision.kind === 'Excluded' && decision.detail).toBe('Modifier 59 excluded by policy: consult not payable');
  });

  it('applies a single multiplier and cites the rule', () => {
    const policy = unwrapped(
      CreditingPolicy.create({ ...testPolicy().config, modifiers: { combinations: [], perModifier: { '25': { kind: 'multiplier', factor: decimal('0.5') } }, scoped: [] } })
    );
    const decision = decideCredit(lineOf({ units: 2, modifiers: ['25'] }), scheduleOf({}), policy);
    expect(decision.kind === 'Credited' && decision.rule).toBe('modifier:multiplier:25');
    expect(decision.kind === 'Credited' && decision.wrvu.toFixed(4)).toBe('3.0000');
  });

  it('applies code scoped rules over global ones', () => {
    const policy = unwrapped(
      CreditingPolicy.create({
        ...testPolicy().config,
        modifiers: {
          combinations: [],
          perModifier: { '25': { kind: 'multiplier', factor: decimal('0.5') } },
          scoped: [{ code: '99213', modifier: '25', action: { kind: 'multiplier', factor: decimal('2') } }]
        }
      })
    );
    const decision = decideCredit(lineOf({ modifiers: ['25'] }), scheduleOf({}), policy);
    expect(decision.kind === 'Credited' && decision.wrvu.toFixed(4)).toBe('6.0000');
  });

  it('passes unknown modifiers to review even when the schedule would credit', () => {
    const decision = decideCredit(lineOf({ modifiers: ['zz'] }), scheduleOf({}), testPolicy());
    expect(decision.kind === 'NeedsReview' && decision.reason).toBe('modifier_not_supported');
    expect(
      decision.kind === 'NeedsReview' && decision.detail
    ).toBe(`Modifier(s) ZZ not supported by policy`);
    expect(
      decision.kind === 'NeedsReview' && decision.trace.factor.compare(decimal('1'))
    ).toBe(0);
  });

  it('keeps the fixed schedule version id on review decisions', () => {
    const fixed = unwrapped(
      CreditingPolicy.create({
        policyId: 'policy-1',
        dateBasis: 'service_date',
        scheduleBasis: { kind: 'fixed', scheduleVersionId: 'sch-2025' },
        statusRules: { final: 'credit', pending: 'review', voided: 'exclude' },
        maxUnitsPerLine: 1000,
        modifiers: { combinations: [], perModifier: {}, scoped: [] },
        correctionRule: 'original_period_while_open'
      })
    );
    const withoutSchedule = decideCredit(lineOf({}), null, fixed);
    expect(withoutSchedule.kind === 'NeedsReview' && withoutSchedule.scheduleVersionId).toBe('sch-2025');
    const withOther = decideCredit(lineOf({}), scheduleOf({}), fixed);
    expect(withOther.kind === 'NeedsReview' && withOther.scheduleVersionId).toBe('sch-2025');
    const excludedScope = decideCredit(lineOf({ status: 'voided' }), scheduleOf({}), fixed);
    expect(excludedScope.kind === 'Excluded' && excludedScope.scheduleVersionId).toBe('sch-2025');
    const unmatched = decideCredit(lineOf({}), scheduleOf({}), fixed);
    expect(unmatched.kind === 'NeedsReview' && unmatched.detail).toBe(
      'Schedule sch-2026 does not match policy schedule version sch-2025'
    );
  });

  it('pins review detail messages for provider, units, schedule, and lookup reasons', () => {
    const providerless = decideCredit(lineOf({ providerId: null }), scheduleOf({}), testPolicy());
    expect(providerless.kind === 'NeedsReview' && providerless.detail).toBe('Line has no provider mapped');
    const units = decideCredit(lineOf({ units: 0 }), scheduleOf({}), testPolicy());
    expect(units.kind === 'NeedsReview' && units.detail).toBe('units 0 must be an integer between 1 and 1000');
    const missingSchedule = decideCredit(lineOf({}), null, testPolicy());
    expect(missingSchedule.kind === 'NeedsReview' && missingSchedule.detail).toBe('No RVU schedule is available');
    const unknownCode = decideCredit(lineOf({ code: '99214' }), scheduleOf({}), testPolicy());
    expect(unknownCode.kind === 'NeedsReview' && unknownCode.detail).toBe('Code 99214 not in schedule sch-2026');
    const noValue = decideCredit(lineOf({}), scheduleOf({ values: { '99213': null } }), testPolicy());
    expect(noValue.kind === 'NeedsReview' && noValue.detail).toBe('Code 99213 has no RVU value in schedule sch-2026');
  });

  it('reviews ambiguous multipliers with the modifiers named', () => {
    const policy = unwrapped(
      CreditingPolicy.create({
        ...testPolicy().config,
        modifiers: {
          combinations: [],
          perModifier: {
            '25': { kind: 'multiplier', factor: decimal('0.5') },
            '26': { kind: 'multiplier', factor: decimal('2') }
          },
          scoped: []
        }
      })
    );
    const decision = decideCredit(lineOf({ modifiers: ['26', '25'] }), scheduleOf({}), policy);
    expect(decision.kind === 'NeedsReview' && decision.reason).toBe('ambiguous_multipliers');
    expect(decision.kind === 'NeedsReview' && decision.detail).toBe('Modifiers 25, 26 create ambiguous multipliers');
  });
});

describe('default policy', () => {
  it('credits final lines and excludes pending and voided', () => {
    const policy = unwrapped(defaultPolicy('default'));
    expect(policy.config.statusRules).toEqual({ final: 'credit', pending: 'exclude', voided: 'exclude' });
    expect(policy.config.maxUnitsPerLine).toBe(1000);
    expect(policy.config.dateBasis).toBe('service_date');
    expect(policy.config.scheduleBasis).toEqual({ kind: 'service_date' });
    expect(policy.config.correctionRule).toBe('original_period_while_open');
    expect(policy.config.modifiers).toEqual({ combinations: [], perModifier: {}, scoped: [] });
  });
});
