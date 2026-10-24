import { describe, expect, it } from 'vitest';
import { DecimalValue, type DomainError } from '@rvu/shared-kernel';
import { CreditingPolicy, type CreditingPolicyConfig } from './crediting-policy';
import { defaultPolicy } from './default-policy';

function decimal(value: string): DecimalValue {
  const parsed = DecimalValue.parse(value);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

function multiplierAction(factor: string): { kind: 'multiplier'; factor: DecimalValue } {
  return { kind: 'multiplier', factor: decimal(factor) };
}

function baseConfig(): CreditingPolicyConfig {
  return {
    policyId: 'policy-1',
    dateBasis: 'service_date',
    scheduleBasis: { kind: 'service_date' },
    statusRules: { final: 'credit', pending: 'exclude', voided: 'exclude' },
    maxUnitsPerLine: 1000,
    modifiers: { combinations: [], perModifier: {}, scoped: [] },
    correctionRule: 'original_period_while_open'
  };
}

function problemsOf(error: DomainError): readonly string[] {
  const problems = error.details?.problems;
  return Array.isArray(problems) ? (problems as readonly string[]) : [];
}

function expectProblemsOf(source: unknown): readonly string[] {
  const outcome = CreditingPolicy.create(source as CreditingPolicyConfig);
  if (outcome.ok) {
    throw new Error('expected policy creation to fail');
  }
  return problemsOf(outcome.error);
}

describe('CreditingPolicy.create', () => {
  it('builds a valid policy and preserves the configuration', () => {
    const outcome = CreditingPolicy.create(baseConfig());
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.value.config).toEqual(baseConfig());
  });

  it('reports a single crediting/policy-invalid error for invalid configurations', () => {
    const outcome = CreditingPolicy.create({ ...baseConfig(), policyId: '   ' });
    if (outcome.ok) {
      throw new Error('expected policy creation to fail');
    }
    expect(outcome.error.code).toBe('crediting/policy-invalid');
    expect(problemsOf(outcome.error)).toContain('policyId must be a non-empty string');
  });

  it('requires a rule for every line status and only known rules', () => {
    const problems = expectProblemsOf({
      ...baseConfig(),
      statusRules: { final: 'credit', pending: 'hold', voided: undefined } as unknown as CreditingPolicyConfig['statusRules']
    });
    expect(problems).toContain('statusRules.pending must be "credit", "exclude", or "review"');
    expect(problems).toContain('statusRules.voided must be "credit", "exclude", or "review"');
  });

  it('rejects unknown date bases and correction rules', () => {
    const problems = expectProblemsOf({ ...baseConfig(), dateBasis: 'calendar' });
    expect(problems).toContain('dateBasis must be "service_date" or "posting_date"');
    const correctionProblems = expectProblemsOf({ ...baseConfig(), correctionRule: 'random' });
    expect(correctionProblems).toContain('correctionRule must be "original_period_while_open" or "always_adjustment"');
  });

  it('rejects fixed schedule basis without a version id', () => {
    const problems = expectProblemsOf({ ...baseConfig(), scheduleBasis: { kind: 'fixed', scheduleVersionId: '' } });
    expect(problems).toContain('scheduleBasis.scheduleVersionId must be a non-empty string');
  });

  it('accepts fixed schedule basis with a version id', () => {
    const outcome = CreditingPolicy.create({ ...baseConfig(), scheduleBasis: { kind: 'fixed', scheduleVersionId: 'sch-2025' } });
    expect(outcome.ok).toBe(true);
  });

  it('rejects maxUnitsPerLine outside 1..100000 and non-integers, and accepts the boundary', () => {
    for (const units of [0, -5, 100001, 1.5]) {
      const problems = expectProblemsOf({ ...baseConfig(), maxUnitsPerLine: units });
      expect(problems).toContain('maxUnitsPerLine must be an integer between 1 and 100000');
    }
    expect(CreditingPolicy.create({ ...baseConfig(), maxUnitsPerLine: 100000 }).ok).toBe(true);
  });

  it('rejects zero, negative, and over-precise multiplier factors', () => {
    for (const factor of ['0', '-0.5', '0.12345']) {
      const problems = expectProblemsOf({
        ...baseConfig(),
        modifiers: { combinations: [], perModifier: { '25': multiplierAction(factor) }, scoped: [] }
      });
      expect(problems.some((problem) => problem.includes('factor must be a positive decimal with at most 4 fractional digits'))).toBe(true);
    }
  });

  it('accepts trailing-zero factors at up to four fractional digits', () => {
    const outcome = CreditingPolicy.create({
      ...baseConfig(),
      modifiers: { combinations: [], perModifier: { '25': multiplierAction('0.5000') }, scoped: [] }
    });
    expect(outcome.ok).toBe(true);
  });

  it('rejects multiplier factors that are not decimal values', () => {
    const problems = expectProblemsOf({
      ...baseConfig(),
      modifiers: { combinations: [], perModifier: { '25': { kind: 'multiplier', factor: 'abc' } }, scoped: [] }
    });
    expect(problems.some((problem) => problem.includes('factor must be a positive decimal with at most 4 fractional digits'))).toBe(true);
  });

  it('rejects per-modifier keys that are not normalized', () => {
    const problems = expectProblemsOf({
      ...baseConfig(),
      modifiers: { combinations: [], perModifier: { ' 25 ': multiplierAction('0.5') }, scoped: [] }
    });
    expect(problems.some((problem) => problem.includes('must equal its normalized form'))).toBe(true);
  });

  it('rejects combinations whose members are not normalized', () => {
    const problems = expectProblemsOf({
      ...baseConfig(),
      modifiers: { combinations: [{ modifiers: ['25 ', 'pt '], action: multiplierAction('1.5') }], perModifier: {}, scoped: [] }
    });
    expect(problems.some((problem) => problem.includes('combination modifiers must be non-empty uppercase modifiers'))).toBe(true);
  });

  it('rejects duplicate combination rules independent of member order', () => {
    const problems = expectProblemsOf({
      ...baseConfig(),
      modifiers: {
        combinations: [
          { modifiers: ['25', '59'], action: multiplierAction('1.5') },
          { modifiers: ['59', '25'], action: multiplierAction('2.5') }
        ],
        perModifier: {},
        scoped: []
      }
    });
    expect(problems.some((problem) => problem.includes('combination rule "|25,59" is duplicated'))).toBe(true);
  });

  it('rejects duplicate and non-normalized scoped rules', () => {
    const problems = expectProblemsOf({
      ...baseConfig(),
      modifiers: {
        combinations: [],
        perModifier: {},
        scoped: [
          { code: '99213', modifier: '25', action: multiplierAction('2') },
          { code: '99213', modifier: ' 25 ', action: multiplierAction('3') }
        ]
      }
    });
    expect(problems.some((problem) => problem.includes('scoped modifier rule "99213|25" is duplicated'))).toBe(true);
    expect(problems.some((problem) => problem.includes('must be non-empty uppercase'))).toBe(true);
  });

  it('rejects exclude actions without reasons and unknown action kinds', () => {
    const problems = expectProblemsOf({
      ...baseConfig(),
      modifiers: { combinations: [], perModifier: { '59': { kind: 'exclude', reason: ' ' } }, scoped: [] }
    });
    expect(problems.some((problem) => problem.includes('exclude action requires a non-empty reason'))).toBe(true);
    const unknownProblems = expectProblemsOf({
      ...baseConfig(),
      modifiers: { combinations: [], perModifier: { '59': { kind: 'warp' } }, scoped: [] }
    });
    expect(unknownProblems.some((problem) => problem.includes('modifier action kind must be'))).toBe(true);
  });

  it('aggregates every problem into one error', () => {
    const problems = expectProblemsOf({
      policyId: '',
      dateBasis: 'unknown',
      scheduleBasis: { kind: 'fixed', scheduleVersionId: '' },
      statusRules: { final: 'credit', pending: 'exclude', voided: 'sometimes' },
      maxUnitsPerLine: 0,
      modifiers: { combinations: [], perModifier: {}, scoped: [] },
      correctionRule: 'random'
    });
    expect(problems).toContain('policyId must be a non-empty string');
    expect(problems).toContain('dateBasis must be "service_date" or "posting_date"');
    expect(problems).toContain('scheduleBasis.scheduleVersionId must be a non-empty string');
    expect(problems).toContain('statusRules.voided must be "credit", "exclude", or "review"');
    expect(problems).toContain('maxUnitsPerLine must be an integer between 1 and 100000');
    expect(problems).toContain('correctionRule must be "original_period_while_open" or "always_adjustment"');
    expect(problems.length).toBe(6);
  });
});

describe('CreditingPolicy canonical JSON', () => {
  function policyWithRules(): CreditingPolicy {
    const outcome = CreditingPolicy.create({
      ...baseConfig(),
      modifiers: {
        combinations: [
          { modifiers: ['25', '59'], action: multiplierAction('1.5') },
          { code: '99213', modifiers: ['59'], action: multiplierAction('2') }
        ],
        perModifier: { '59': multiplierAction('2.5'), '25': multiplierAction('0.5') },
        scoped: [
          { code: '99214', modifier: '25', action: multiplierAction('9') },
          { code: '99213', modifier: '59', action: multiplierAction('1') }
        ]
      }
    });
    if (!outcome.ok) {
      throw new Error(outcome.error.message);
    }
    return outcome.value;
  }

  it('contains key-ordered canonical output', () => {
    const json = policyWithRules().toCanonical();
    expect(json.policyId).toBe('policy-1');
    expect(json.dateBasis).toBe('service_date');
    expect(json.maxUnitsPerLine).toBe(1000);
    expect(json.correctionRule).toBe('original_period_while_open');
    expect(json.scheduleBasis).toEqual({ kind: 'service_date' });
    expect(json.statusRules).toEqual({ final: 'credit', pending: 'exclude', voided: 'exclude' });
    expect(json.modifiers.perModifier['25']).toEqual({ kind: 'multiplier', factor: '0.5' });
    expect(json.modifiers.scoped[0]).toEqual({ action: { kind: 'multiplier', factor: '1' }, code: '99213', modifier: '59' });
    expect(json.modifiers.combinations[0]).toEqual({ action: { kind: 'multiplier', factor: '1.5' }, modifiers: ['25', '59'] });
    expect(json.modifiers.combinations[1]).toEqual({ action: { kind: 'multiplier', factor: '2' }, code: '99213', modifiers: ['59'] });
  });

  it('parses its own canonical output back to an equal policy', () => {
    const policy = policyWithRules();
    const roundTrip = CreditingPolicy.fromJson(policy.toCanonical());
    expect(roundTrip.ok).toBe(true);
    expect(roundTrip.ok && policy.equals(roundTrip.value)).toBe(true);
    expect(roundTrip.ok && roundTrip.value.toCanonical()).toEqual(policy.toCanonical());
  });

  it('rejects unknown fields in canonical JSON', () => {
    const outcome = CreditingPolicy.fromJson({ ...policyWithRules().toCanonical(), attributionRule: 'first-billed' });
    if (outcome.ok) {
      throw new Error('expected policy parse to fail');
    }
    expect(outcome.error.code).toBe('crediting/policy-invalid');
    expect(problemsOf(outcome.error)).toContain('unknown field "attributionRule"');
  });

  it('rejects factor strings that are not valid decimals', () => {
    const json = policyWithRules().toCanonical();
    const bad = { ...json, modifiers: { ...json.modifiers, perModifier: { '25': { kind: 'multiplier', factor: 'abc' } } } };
    const outcome = CreditingPolicy.fromJson(bad);
    if (outcome.ok) {
      throw new Error('expected policy parse to fail');
    }
    expect(problemsOf(outcome.error).some((problem) => problem.includes('is not a valid decimal'))).toBe(true);
  });

  it('canonical order is stable regardless of declaration order', () => {
    const policy = policyWithRules();
    const mirroredOutcome = CreditingPolicy.create({
      ...baseConfig(),
      modifiers: {
        combinations: [
          { code: '99213', modifiers: ['59'], action: multiplierAction('2') },
          { modifiers: ['25', '59'], action: multiplierAction('1.5') }
        ],
        perModifier: { '25': multiplierAction('0.5'), '59': multiplierAction('2.5') },
        scoped: [
          { code: '99213', modifier: '59', action: multiplierAction('1') },
          { code: '99214', modifier: '25', action: multiplierAction('9') }
        ]
      }
    });
    if (!mirroredOutcome.ok) {
      throw new Error(mirroredOutcome.error.message);
    }
    expect(policy.equals(mirroredOutcome.value)).toBe(true);
    expect(JSON.stringify(mirroredOutcome.value.toCanonical())).toBe(JSON.stringify(policy.toCanonical()));
  });

  it('survives non-deviation data changes via JSON clone', () => {
    const policy = policyWithRules().toCanonical();
    const clone = JSON.parse(JSON.stringify(policy)) as unknown;
    const result = CreditingPolicy.fromJson(clone);
    expect(result.ok).toBe(true);
  });

  it('round-trips the default policy through JSON', () => {
    const policy = defaultPolicy('default');
    if (!policy.ok) {
      throw new Error(policy.error.message);
    }
    const clone = JSON.parse(JSON.stringify(policy.value.toCanonical())) as unknown;
    const result = CreditingPolicy.fromJson(clone);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.equals(policy.value)).toBe(true);
  });

  it('equals is false for unknown values', () => {
    const policy = policyWithRules();
    expect(policy.equals(null)).toBe(false);
    expect(policy.equals({})).toBe(false);
    expect(policy.equals(policy.toCanonical())).toBe(false);
  });

  it('distinguishes policies that differ only in a factor string', () => {
    const first = policyWithRules();
    const second = CreditingPolicy.fromJson(first.toCanonical());
    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error(second.error.message);
    }
    const third = CreditingPolicy.create({ ...second.value.config, maxUnitsPerLine: 1001 });
    expect(third.ok).toBe(true);
    expect(third.ok && first.equals(third.value)).toBe(false);
  });
});
