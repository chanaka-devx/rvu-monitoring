import { DecimalValue } from '@rvu/shared-kernel';

export type ModifierAction = PassthroughAction | MultiplierAction | ExcludeAction;

export interface PassthroughAction {
  readonly kind: 'passthrough';
}

export interface MultiplierAction {
  readonly kind: 'multiplier';
  readonly factor: DecimalValue;
}

export interface ExcludeAction {
  readonly kind: 'exclude';
  readonly reason: string;
}

export interface ScopedModifierRule {
  readonly code: string;
  readonly modifier: string;
  readonly action: ModifierAction;
}

export interface CombinationModifierRule {
  readonly code?: string;
  readonly modifiers: readonly string[];
  readonly action: ModifierAction;
}

export interface ModifierRules {
  readonly perModifier: Readonly<Record<string, ModifierAction>>;
  readonly scoped: readonly ScopedModifierRule[];
  readonly combinations: readonly CombinationModifierRule[];
}

export type ModifierOutcome =
  | { readonly kind: 'apply'; readonly factor: DecimalValue; readonly rule: string }
  | { readonly kind: 'exclude'; readonly modifier: string; readonly reason: string }
  | {
      readonly kind: 'review';
      readonly reason: 'ambiguous_multipliers' | 'modifier_not_supported';
      readonly modifiers: readonly string[];
    };

function factorOne(): DecimalValue {
  const parsed = DecimalValue.parse('1');
  return parsed.ok ? parsed.value : DecimalValue.zero();
}

export function unitFactor(): DecimalValue {
  return factorOne();
}

export function normalizeModifiers(raw: readonly string[]): readonly string[] {
  const normalized = raw
    .map((value) => (typeof value === 'string' ? value.trim().toUpperCase() : ''))
    .filter((value) => value.length > 0);
  return Array.from(new Set(normalized)).sort();
}

export function resolveModifiers(code: string, raw: readonly string[], rules: ModifierRules): ModifierOutcome {
  const modifiers = normalizeModifiers(raw);
  if (modifiers.length === 0) {
    return { kind: 'apply', factor: factorOne(), rule: 'standard' };
  }
  return resolveCombination(code, modifiers, rules);
}

function resolveCombination(code: string, modifiers: readonly string[], rules: ModifierRules): ModifierOutcome {
  const combination = findCombination(rules, code, modifiers) ?? findCombination(rules, undefined, modifiers);
  if (combination !== undefined) {
    return applyAction(combination.action, `combination:${modifiers.join(',')}`, modifiers);
  }
  return resolvePerModifier(code, modifiers, rules);
}

function findCombination(
  rules: ModifierRules,
  code: string | undefined,
  modifiers: readonly string[]
): CombinationModifierRule | undefined {
  const wanted = modifiers.join(',');
  for (const combination of rules.combinations) {
    if (combination.code !== code) {
      continue;
    }
    const keys = normalizeModifiers(combination.modifiers);
    if (keys.length === modifiers.length && keys.join(',') === wanted) {
      return combination;
    }
  }
  return undefined;
}

function resolvePerModifier(code: string, modifiers: readonly string[], rules: ModifierRules): ModifierOutcome {
  const unsupported: string[] = [];
  let excluded: { readonly modifier: string; readonly action: ExcludeAction } | undefined;
  let multiplierCount = 0;
  let multiplier: { readonly modifier: string; readonly action: MultiplierAction } | undefined;
  let passthrough: PassthroughAction | undefined;
  for (const modifier of modifiers) {
    const action = actionFor(code, modifier, rules);
    if (action === undefined) {
      unsupported.push(modifier);
      continue;
    }
    if (excluded === undefined && action.kind === 'exclude') {
      excluded = { modifier, action };
      continue;
    }
    if (action.kind === 'passthrough') {
      passthrough = action;
      continue;
    }
    if (action.kind === 'multiplier') {
      if (multiplier === undefined) {
        multiplier = { modifier, action };
      }
      multiplierCount += 1;
    }
  }
  if (unsupported.length > 0) {
    return { kind: 'review', reason: 'modifier_not_supported', modifiers: unsupported };
  }
  if (excluded !== undefined) {
    return { kind: 'exclude', modifier: excluded.modifier, reason: excluded.action.reason };
  }
  if (multiplierCount > 1) {
    return { kind: 'review', reason: 'ambiguous_multipliers', modifiers };
  }
  if (multiplier !== undefined) {
    return {
      kind: 'apply',
      factor: multiplier.action.factor,
      rule: `modifier:multiplier:${multiplier.modifier}`
    };
  }
  if (passthrough === undefined) {
    return { kind: 'review', reason: 'modifier_not_supported', modifiers };
  }
  return { kind: 'apply', factor: factorOne(), rule: 'modifier:passthrough' };
}

function actionFor(code: string, modifier: string, rules: ModifierRules): ModifierAction | undefined {
  const scoped = rules.scoped.find((rule) => rule.modifier === modifier && rule.code === code);
  if (scoped !== undefined) {
    return scoped.action;
  }
  const shared = rules.perModifier[modifier];
  return shared === undefined ? undefined : shared;
}

export function applyAction(
  action: ModifierAction,
  rule: string,
  modifiers: readonly string[]
): ModifierOutcome {
  if (action.kind === 'exclude') {
    return { kind: 'exclude', modifier: modifiers[0] ?? '', reason: action.reason };
  }
  if (action.kind === 'passthrough') {
    return { kind: 'apply', factor: factorOne(), rule };
  }
  return { kind: 'apply', factor: action.factor, rule };
}
