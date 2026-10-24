import { describe, expect, it } from 'vitest';
import { DecimalValue } from '@rvu/shared-kernel';
import { normalizeModifiers, resolveModifiers, type ModifierRules } from './modifier-rules';

function decimal(value: string): DecimalValue {
  const parsed = DecimalValue.parse(value);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

function multiplierAction(factor: string) {
  return { kind: 'multiplier' as const, factor: decimal(factor) };
}

function excludeAction(reason: string) {
  return { kind: 'exclude' as const, reason };
}

const emptyRules: ModifierRules = { combinations: [], perModifier: {}, scoped: [] };

describe('normalizeModifiers', () => {
  it('trims, uppercases, drops blanks, dedupes, and sorts', () => {
    expect(normalizeModifiers(['59', '25 ', '  ', '25', 'LT'])).toEqual(['25', '59', 'LT']);
  });
});

describe('resolveModifiers', () => {
  it('applies the standard rule with factor one for empty modifiers', () => {
    const outcome = resolveModifiers('99213', [], emptyRules);
    expect(outcome.kind).toBe('apply');
    expect(outcome.kind === 'apply' && outcome.rule).toBe('standard');
    expect(outcome.kind === 'apply' && outcome.factor.compare(decimal('1'))).toBe(0);
  });

  it('normalizes modifier casing and whitespace before resolution', () => {
    const rules: ModifierRules = { combinations: [], perModifier: { '25': multiplierAction('0.5') }, scoped: [] };
    const outcome = resolveModifiers('99213', [' 25 '], rules);
    expect(outcome.kind === 'apply' && outcome.rule).toBe('modifier:multiplier:25');
  });

  it('reviews unsupported modifiers without inventing a factor', () => {
    const outcome = resolveModifiers('99213', ['LT'], emptyRules);
    expect(outcome).toEqual({ kind: 'review', reason: 'modifier_not_supported', modifiers: ['LT'] });
  });

  it('lists only unsupported modifiers among supported ones', () => {
    const rules: ModifierRules = { combinations: [], perModifier: { '25': multiplierAction('0.5') }, scoped: [] };
    const outcome = resolveModifiers('99213', ['25', 'LT'], rules);
    expect(outcome.kind === 'review' && outcome.reason).toBe('modifier_not_supported');
    expect(outcome.kind === 'review' && outcome.modifiers).toEqual(['LT']);
  });

  it('excludes through per-modifier rules including the reason', () => {
    const rules: ModifierRules = { combinations: [], perModifier: { '59': excludeAction('consult not payable') }, scoped: [] };
    const outcome = resolveModifiers('99213', ['59'], rules);
    expect(outcome).toEqual({ kind: 'exclude', modifier: '59', reason: 'consult not payable' });
  });

  it('excludes the first sorted excluded modifier when several are excluded', () => {
    const rules: ModifierRules = {
      combinations: [],
      perModifier: { '25': multiplierAction('0.5'), '59': multiplierAction('2'), 'ZZ': excludeAction('blocked') },
      scoped: []
    };
    const outcome = resolveModifiers('99213', ['59', 'zz', '25'], rules);
    expect(outcome.kind === 'exclude' && outcome.modifier).toBe('ZZ');
  });

  it('exclusion wins over ambiguous multipliers regardless of position', () => {
    const rules: ModifierRules = {
      combinations: [],
      perModifier: { '25': multiplierAction('0.5'), '26': multiplierAction('2'), '59': excludeAction('consult') },
      scoped: []
    };
    const outcome = resolveModifiers('99213', ['26', '25', '59'], rules);
    expect(outcome.kind === 'exclude' && outcome.modifier).toBe('59');
  });

  it('reviews ambiguous multipliers', () => {
    const rules: ModifierRules = {
      combinations: [],
      perModifier: { '25': multiplierAction('0.5'), '26': multiplierAction('2') },
      scoped: []
    };
    const outcome = resolveModifiers('99213', ['25', '26'], rules);
    expect(outcome.kind === 'review' && outcome.reason).toBe('ambiguous_multipliers');
  });

  it('applies a single multiplier with its rule id', () => {
    const rules: ModifierRules = { combinations: [], perModifier: { '25': multiplierAction('0.5') }, scoped: [] };
    const outcome = resolveModifiers('99213', ['25'], rules);
    expect(outcome.kind === 'apply' && outcome.rule).toBe('modifier:multiplier:25');
    expect(outcome.kind === 'apply' && outcome.factor.compare(decimal('0.5'))).toBe(0);
  });

  it('applies passthrough modifiers with factor one', () => {
    const rules: ModifierRules = { combinations: [], perModifier: { '23': { kind: 'passthrough' } }, scoped: [] };
    const outcome = resolveModifiers('99213', ['23'], rules);
    expect(outcome.kind === 'apply' && outcome.rule).toBe('modifier:passthrough');
    expect(outcome.kind === 'apply' && outcome.factor.compare(decimal('1'))).toBe(0);
  });

  it('exact combination rules win over per-modifier rules', () => {
    const rules: ModifierRules = {
      combinations: [{ modifiers: ['25', '59'], action: multiplierAction('1.5') }],
      perModifier: { '25': multiplierAction('0.5'), '59': multiplierAction('2') },
      scoped: []
    };
    const outcome = resolveModifiers('99213', ['25', '59'], rules);
    expect(outcome.kind === 'apply' && outcome.rule).toBe('combination:25,59');
    expect(outcome.kind === 'apply' && outcome.factor.compare(decimal('1.5'))).toBe(0);
  });

  it('combination matching is order, case, and whitespace insensitive', () => {
    const rules: ModifierRules = { combinations: [{ modifiers: ['25', '59'], action: multiplierAction('1.25') }], perModifier: {}, scoped: [] };
    const outcome = resolveModifiers('99213', [' 59 ', '25'], rules);
    expect(outcome.kind === 'apply' && outcome.rule).toBe('combination:25,59');
  });

  it('code scoped combinations beat global combinations', () => {
    const rules: ModifierRules = {
      combinations: [
        { modifiers: ['25', '59'], action: multiplierAction('1.5') },
        { code: '99213', modifiers: ['25', '59'], action: multiplierAction('3') }
      ],
      perModifier: {},
      scoped: []
    };
    const outcome = resolveModifiers('99213', ['25', '59'], rules);
    expect(outcome.kind === 'apply' && outcome.factor.compare(decimal('3'))).toBe(0);
  });

  it('global combinations apply to other codes', () => {
    const rules: ModifierRules = {
      combinations: [
        { modifiers: ['25', '59'], action: multiplierAction('1.5') },
        { code: '99213', modifiers: ['25', '59'], action: multiplierAction('3') }
      ],
      perModifier: {},
      scoped: []
    };
    const outcome = resolveModifiers('99442', ['25', '59'], rules);
    expect(outcome.kind === 'apply' && outcome.factor.compare(decimal('1.5'))).toBe(0);
  });

  it('global combinations do not beat code scoped per-modifier rules', () => {
    const rules: ModifierRules = {
      combinations: [{ modifiers: ['25', '59'], action: multiplierAction('1.5') }],
      perModifier: { '25': multiplierAction('0.5') },
      scoped: []
    };
    const outcome = resolveModifiers('99213', ['25', '59'], rules);
    expect(outcome.kind === 'apply' && outcome.rule).toBe('combination:25,59');
  });

  it('code scoped per-modifier rules beat global ones', () => {
    const rules: ModifierRules = {
      combinations: [],
      perModifier: { '25': multiplierAction('0.5') },
      scoped: [{ code: '99213', modifier: '25', action: multiplierAction('2') }]
    };
    const outcome = resolveModifiers('99213', ['25'], rules);
    expect(outcome.kind === 'apply' && outcome.factor.compare(decimal('2'))).toBe(0);
  });

  it('scoped rules from other codes do not apply', () => {
    const rules: ModifierRules = {
      combinations: [],
      perModifier: {},
      scoped: [{ code: '99214', modifier: '25', action: multiplierAction('2') }]
    };
    const outcome = resolveModifiers('99213', ['25'], rules);
    expect(outcome.kind).toBe('review');
  });

  it('combination with an exclude action excludes with the combination participants', () => {
    const rules: ModifierRules = {
      combinations: [{ modifiers: ['25', '59'], action: excludeAction('bundled') }],
      perModifier: {},
      scoped: []
    };
    const outcome = resolveModifiers('99213', ['25', '59'], rules);
    expect(outcome.kind === 'exclude' && outcome.reason).toBe('bundled');
  });
});
