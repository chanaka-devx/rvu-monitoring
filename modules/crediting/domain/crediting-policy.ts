import type { DomainError } from '@rvu/shared-kernel';
import { DecimalValue, errorOf, type Result } from '@rvu/shared-kernel';
import type {
  CombinationModifierRule,
  ModifierAction,
  ModifierRules,
  ScopedModifierRule
} from './modifier-rules';
import { normalizeModifiers } from './modifier-rules';
import type { LineStatus } from './service-line-version';
import { LINE_STATUSES } from './service-line-version';

export type DateBasis = 'posting_date' | 'service_date';

export type StatusRule = 'credit' | 'exclude' | 'review';

export type StatusRuleMap = Record<LineStatus, StatusRule>;

export type CorrectionRule = 'always_adjustment' | 'original_period_while_open';

export type ScheduleBasis = FixedScheduleBasis | ServiceDateScheduleBasis;

export interface FixedScheduleBasis {
  readonly kind: 'fixed';
  readonly scheduleVersionId: string;
}

export interface ServiceDateScheduleBasis {
  readonly kind: 'service_date';
}

export interface CreditingPolicyConfig {
  readonly policyId: string;
  readonly dateBasis: DateBasis;
  readonly scheduleBasis: ScheduleBasis;
  readonly statusRules: StatusRuleMap;
  readonly maxUnitsPerLine: number;
  readonly modifiers: ModifierRules;
  readonly correctionRule: CorrectionRule;
}

const DATE_BASES = ['posting_date', 'service_date'] as const;

const STATUS_RULE_VALUES = ['credit', 'exclude', 'review'] as const;

const CORRECTION_RULES = ['always_adjustment', 'original_period_while_open'] as const;

const MAX_UNITS_BOUND = 100000;

const MAX_FACTOR_FRACTIONAL_DIGITS = 4;

const POLICY_ERROR_CODE = 'crediting/policy-invalid';

const KNOWN_TOP_LEVEL_FIELDS = [
  'correctionRule',
  'dateBasis',
  'maxUnitsPerLine',
  'modifiers',
  'policyId',
  'scheduleBasis',
  'statusRules'
];

export type ActionJson =
  | { readonly factor: string; readonly kind: 'multiplier' }
  | { readonly kind: 'exclude'; readonly reason: string }
  | { readonly kind: 'passthrough' };

export type ScheduleBasisJson =
  | { readonly kind: 'fixed'; readonly scheduleVersionId: string }
  | { readonly kind: 'service_date' };

export interface CreditingPolicyJson {
  readonly correctionRule: string;
  readonly dateBasis: string;
  readonly maxUnitsPerLine: number;
  readonly modifiers: {
    readonly combinations: readonly {
      readonly action: ActionJson;
      readonly code?: string;
      readonly modifiers: readonly string[];
    }[];
    readonly perModifier: Readonly<Record<string, ActionJson>>;
    readonly scoped: readonly {
      readonly action: ActionJson;
      readonly code: string;
      readonly modifier: string;
    }[];
  };
  readonly policyId: string;
  readonly scheduleBasis: ScheduleBasisJson;
  readonly statusRules: Readonly<Record<LineStatus, string>>;
}

export class CreditingPolicy {
  private constructor(private readonly props: { readonly config: CreditingPolicyConfig }) {}

  static create(config: CreditingPolicyConfig): Result<CreditingPolicy, DomainError> {
    const problems: string[] = [];
    const policyId = collectPolicyId(config.policyId, problems);
    const dateBasis = collectDateBasis(config.dateBasis, problems);
    const scheduleBasis = collectScheduleBasis(config.scheduleBasis, problems);
    const statusRules = collectStatusRules(config.statusRules, problems);
    const maxUnitsPerLine = collectUnits(config.maxUnitsPerLine, problems);
    const modifiers = collectModifiers(config.modifiers, problems);
    const correctionRule = collectCorrection(config.correctionRule, problems);
    if (problems.length > 0) {
      return invalidPolicy(problems);
    }
    return {
      ok: true,
      value: new CreditingPolicy({
        config: {
          policyId: policyId as string,
          dateBasis: dateBasis as DateBasis,
          scheduleBasis: scheduleBasis as ScheduleBasis,
          statusRules: statusRules as StatusRuleMap,
          maxUnitsPerLine: maxUnitsPerLine as number,
          modifiers: modifiers as ModifierRules,
          correctionRule: correctionRule as CorrectionRule
        }
      })
    };
  }

  static fromJson(input: unknown): Result<CreditingPolicy, DomainError> {
    const parsed = parseJson(input);
    if (!parsed.ok) {
      return invalidPolicy(parsed.error);
    }
    return CreditingPolicy.create(parsed.value);
  }

  get config(): CreditingPolicyConfig {
    return this.props.config;
  }

  toCanonical(): CreditingPolicyJson {
    return canonicalOf(this.props.config);
  }

  equals(other: unknown): boolean {
    if (!(other instanceof CreditingPolicy)) {
      return false;
    }
    const left = JSON.stringify(this.toCanonical());
    return left === JSON.stringify(other.toCanonical());
  }
}

function invalidPolicy(problems: readonly string[]): {
  readonly ok: false;
  readonly error: DomainError;
} {
  return {
    ok: false,
    error: errorOf('validation', POLICY_ERROR_CODE, `Invalid crediting policy: ${problems.length} problem(s)`, {
      problems: [...problems]
    })
  };
}

function collectPolicyId(raw: unknown, problems: string[]): string | undefined {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    problems.push('policyId must be a non-empty string');
    return undefined;
  }
  return raw;
}

function collectDateBasis(raw: unknown, problems: string[]): DateBasis | undefined {
  if (typeof raw !== 'string' || !(DATE_BASES as readonly string[]).includes(raw)) {
    problems.push('dateBasis must be "service_date" or "posting_date"');
    return undefined;
  }
  return raw as DateBasis;
}

function collectScheduleBasis(raw: unknown, problems: string[]): ScheduleBasis | undefined {
  if (typeof raw !== 'object' || raw === null || !('kind' in raw)) {
    problems.push('scheduleBasis.kind must be "service_date" or "fixed"');
    return undefined;
  }
  const candidate = raw as { kind?: unknown; scheduleVersionId?: unknown };
  if (candidate.kind === 'service_date') {
    return { kind: 'service_date' };
  }
  if (candidate.kind === 'fixed') {
    if (typeof candidate.scheduleVersionId !== 'string' || candidate.scheduleVersionId.trim().length === 0) {
      problems.push('scheduleBasis.scheduleVersionId must be a non-empty string');
      return undefined;
    }
    return { kind: 'fixed', scheduleVersionId: candidate.scheduleVersionId };
  }
  problems.push('scheduleBasis.kind must be "service_date" or "fixed"');
  return undefined;
}

function collectStatusRules(raw: StatusRuleMap, problems: string[]): StatusRuleMap | undefined {
  const resolved: Partial<StatusRuleMap> = {};
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  for (const status of LINE_STATUSES) {
    const value = source[status];
    if (typeof value !== 'string' || !(STATUS_RULE_VALUES as readonly string[]).includes(value)) {
      problems.push(`statusRules.${status} must be "credit", "exclude", or "review"`);
      resolved[status] = 'exclude';
      continue;
    }
    resolved[status] = value as StatusRule;
  }
  return problems.length === 0 ? (resolved as StatusRuleMap) : undefined;
}

function collectUnits(raw: unknown, problems: string[]): number | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > MAX_UNITS_BOUND) {
    problems.push(`maxUnitsPerLine must be an integer between 1 and ${MAX_UNITS_BOUND}`);
    return undefined;
  }
  return raw;
}

function collectCorrection(raw: unknown, problems: string[]): CorrectionRule | undefined {
  if (typeof raw !== 'string' || !(CORRECTION_RULES as readonly string[]).includes(raw)) {
    problems.push('correctionRule must be "original_period_while_open" or "always_adjustment"');
    return undefined;
  }
  return raw as CorrectionRule;
}

function collectModifiers(raw: ModifierRules, problems: string[]): ModifierRules | undefined {
  const source = typeof raw === 'object' && raw !== null ? (raw as Partial<ModifierRules>) : {};
  const perModifier: Record<string, ModifierAction> = {};
  const perModifierSource =
    typeof source.perModifier === 'object' && source.perModifier !== null ? (source.perModifier as Record<string, unknown>) : {};
  if (typeof source.perModifier !== 'object' || source.perModifier === null) {
    problems.push('modifiers.perModifier must be an object');
  }
  for (const key of Object.keys(perModifierSource)) {
    if (key.trim().toUpperCase() !== key || key.length === 0) {
      problems.push(`perModifier modifier key "${key}" must equal its normalized form`);
    }
    const action = validateAction(perModifierSource[key], `perModifier modifier "${key}"`, problems);
    if (action !== undefined) {
      perModifier[key] = action;
    }
  }
  if (!Array.isArray(source.scoped)) {
    problems.push('modifiers.scoped must be an array');
  }
  if (!Array.isArray(source.combinations)) {
    problems.push('modifiers.combinations must be an array');
  }
  const scoped = Array.isArray(source.scoped) ? validateScoped(source.scoped, problems) : [];
  const combinations = Array.isArray(source.combinations) ? validateCombinations(source.combinations, problems) : [];
  return problems.length === 0 ? { combinations, perModifier, scoped } : undefined;
}

function validateScoped(raw: readonly ScopedModifierRule[], problems: string[]): readonly ScopedModifierRule[] {
  const seen = new Set<string>();
  for (const entry of raw) {
    const modifier = entry.modifier.trim().toUpperCase();
    if (modifier.length === 0 || modifier !== entry.modifier || entry.code.length === 0) {
      problems.push(`scoped modifier "${entry.modifier}" must be non-empty uppercase (code "${entry.code}")`);
    }
    const identity = `${entry.code}|${modifier}`;
    if (seen.has(identity)) {
      problems.push(`scoped modifier rule "${identity}" is duplicated`);
    }
    seen.add(identity);
    validateAction(entry.action, `scoped modifier "${entry.modifier}"`, problems);
  }
  return raw;
}

function validateCombinations(raw: readonly CombinationModifierRule[], problems: string[]): readonly CombinationModifierRule[] {
  const seen = new Set<string>();
  for (const entry of raw) {
    const members = normalizeModifiers(entry.modifiers);
    const joined = members.join(',');
    if (joined !== entry.modifiers.join(',') || members.length === 0) {
      problems.push('combination modifiers must be non-empty uppercase modifiers');
    }
    const identity = `${entry.code ?? ''}|${joined}`;
    if (seen.has(identity)) {
      problems.push(`combination rule "${identity}" is duplicated`);
    }
    seen.add(identity);
    validateAction(entry.action, 'combination rule', problems);
  }
  return raw;
}

function validateAction(action: unknown, label: string, problems: string[]): ModifierAction | undefined {
  if (typeof action !== 'object' || action === null || !('kind' in action)) {
    problems.push(`${label}: modifier action kind must be "passthrough", "multiplier", or "exclude"`);
    return undefined;
  }
  const candidate = action as { kind?: unknown; factor?: unknown; reason?: unknown };
  if (candidate.kind === 'passthrough') {
    return { kind: 'passthrough' };
  }
  if (candidate.kind === 'multiplier') {
    if (candidate.factor instanceof DecimalValue) {
      const factor = candidate.factor as DecimalValue;
      if (!factor.greaterThan(DecimalValue.zero()) || !factor.subtract(factor.round(MAX_FACTOR_FRACTIONAL_DIGITS, 'DOWN')).isZero()) {
        problems.push(`${label}: factor must be a positive decimal with at most ${MAX_FACTOR_FRACTIONAL_DIGITS} fractional digits`);
        return undefined;
      }
      return { kind: 'multiplier', factor };
    }
    problems.push(`${label}: factor must be a positive decimal with at most ${MAX_FACTOR_FRACTIONAL_DIGITS} fractional digits`);
    return undefined;
  }
  if (candidate.kind === 'exclude') {
    if (typeof candidate.reason !== 'string' || candidate.reason.trim().length === 0) {
      problems.push(`${label}: exclude action requires a non-empty reason`);
      return undefined;
    }
    return { kind: 'exclude', reason: candidate.reason };
  }
  problems.push(`${label}: modifier action kind must be "passthrough", "multiplier", or "exclude"`);
  return undefined;
}

function parseJson(input: unknown): Result<CreditingPolicyConfig, string[]> {
  const problems: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: ['policy canonical form must be a JSON object'] };
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!KNOWN_TOP_LEVEL_FIELDS.includes(key)) {
      problems.push(`unknown field "${key}"`);
    }
  }
  const policyId = typeof record.policyId === 'string' && record.policyId.trim().length > 0 ? record.policyId : undefined;
  if (policyId === undefined) {
    problems.push('policyId must be a non-empty string');
  }
  const dateBasis = typeof record.dateBasis === 'string' && (DATE_BASES as readonly string[]).includes(record.dateBasis) ? (record.dateBasis as DateBasis) : undefined;
  if (dateBasis === undefined) {
    problems.push('dateBasis must be "service_date" or "posting_date"');
  }
  const scheduleBasis = parseScheduleBasis(record.scheduleBasis, problems);
  const statusRules = parseStatusRules(record.statusRules, problems);
  const maxUnitsPerLine = typeof record.maxUnitsPerLine === 'number' ? record.maxUnitsPerLine : undefined;
  if (maxUnitsPerLine === undefined) {
    problems.push(`maxUnitsPerLine must be an integer between 1 and ${MAX_UNITS_BOUND}`);
  }
  const correctionRule = typeof record.correctionRule === 'string' ? record.correctionRule : undefined;
  if (correctionRule === undefined) {
    problems.push('correctionRule must be "original_period_while_open" or "always_adjustment"');
  }
  const modifiers = parseModifiers(record.modifiers, problems);
  if (problems.length > 0) {
    return { ok: false, error: problems };
  }
  return {
    ok: true,
    value: {
      policyId: policyId as string,
      dateBasis: dateBasis as DateBasis,
      scheduleBasis: scheduleBasis as ScheduleBasis,
      statusRules: statusRules as StatusRuleMap,
      maxUnitsPerLine: maxUnitsPerLine as number,
      modifiers: modifiers as ModifierRules,
      correctionRule: correctionRule as CorrectionRule
    }
  };
}

function parseScheduleBasis(raw: unknown, problems: string[]): ScheduleBasis | undefined {
  if (typeof raw !== 'object' || raw === null || !('kind' in raw)) {
    problems.push('scheduleBasis.kind must be "service_date" or "fixed"');
    return undefined;
  }
  const candidate = raw as { kind?: unknown; scheduleVersionId?: unknown };
  if (candidate.kind === 'service_date') {
    return { kind: 'service_date' };
  }
  if (candidate.kind === 'fixed') {
    if (typeof candidate.scheduleVersionId !== 'string' || candidate.scheduleVersionId.trim().length === 0) {
      problems.push('scheduleBasis.scheduleVersionId must be a non-empty string');
      return undefined;
    }
    return { kind: 'fixed', scheduleVersionId: candidate.scheduleVersionId };
  }
  problems.push('scheduleBasis.kind must be "service_date" or "fixed"');
  return undefined;
}

function parseStatusRules(raw: unknown, problems: string[]): StatusRuleMap | undefined {
  if (typeof raw !== 'object' || raw === null) {
    for (const status of LINE_STATUSES) {
      problems.push(`statusRules.${status} must be "credit", "exclude", or "review"`);
    }
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const resolved: Partial<StatusRuleMap> = {};
  for (const status of LINE_STATUSES) {
    const value = record[status];
    if (typeof value !== 'string' || !(STATUS_RULE_VALUES as readonly string[]).includes(value)) {
      problems.push(`statusRules.${status} must be "credit", "exclude", or "review"`);
      resolved[status] = 'exclude';
      continue;
    }
    resolved[status] = value as StatusRule;
  }
  return resolved as StatusRuleMap;
}

function parseModifiers(raw: unknown, problems: string[]): ModifierRules | undefined {
  if (typeof raw !== 'object' || raw === null) {
    problems.push('modifiers must be an object with perModifier, scoped, and combinations');
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  return { combinations: parseCombinations(record.combinations, problems), perModifier: parsePerModifier(record.perModifier, problems), scoped: parseScoped(record.scoped, problems) };
}

function parsePerModifier(raw: unknown, problems: string[]): Readonly<Record<string, ModifierAction>> {
  const resolved: Record<string, ModifierAction> = {};
  if (typeof raw !== 'object' || raw === null) {
    problems.push('modifiers.perModifier must be an object');
    return resolved;
  }
  for (const key of Object.keys(raw as Record<string, unknown>)) {
    const action = parseAction((raw as Record<string, unknown>)[key], `perModifier modifier "${key}"`, problems);
    if (action !== undefined) {
      resolved[key] = action;
    }
  }
  return resolved;
}

function parseScoped(raw: unknown, problems: string[]): readonly ScopedModifierRule[] {
  const resolved: ScopedModifierRule[] = [];
  if (!Array.isArray(raw)) {
    problems.push('modifiers.scoped must be an array');
    return resolved;
  }
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || !('code' in entry) || !('modifier' in entry)) {
      problems.push('modifiers.scoped entries require code, modifier, and action');
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.code !== 'string' || typeof record.modifier !== 'string') {
      problems.push('modifiers.scoped entries require code, modifier, and action');
      continue;
    }
    const action = parseAction(record.action, `scoped modifier "${record.modifier}"`, problems);
    if (action !== undefined) {
      resolved.push({ code: record.code, modifier: record.modifier, action });
    }
  }
  return resolved;
}

function parseCombinations(raw: unknown, problems: string[]): readonly CombinationModifierRule[] {
  const resolved: CombinationModifierRule[] = [];
  if (!Array.isArray(raw)) {
    problems.push('modifiers.combinations must be an array');
    return resolved;
  }
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || !('modifiers' in entry)) {
      problems.push('modifiers.combinations entries require modifiers and action');
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (record.code !== undefined && typeof record.code !== 'string') {
      problems.push('modifiers.combinations code must be a string when present');
      continue;
    }
    if (!Array.isArray(record.modifiers) || !record.modifiers.every((value) => typeof value === 'string')) {
      problems.push('modifiers.combinations modifiers must be an array of strings');
      continue;
    }
    const action = parseAction(record.action, 'combination rule', problems);
    const code = typeof record.code === 'string' ? record.code : undefined;
    if (action !== undefined) {
      resolved.push(code === undefined ? { modifiers: [...record.modifiers], action } : { code, modifiers: [...record.modifiers], action });
    }
  }
  return resolved;
}

function parseAction(raw: unknown, label: string, problems: string[]): ModifierAction | undefined {
  if (typeof raw !== 'object' || raw === null || !('kind' in raw)) {
    problems.push(`${label}: modifier action kind must be "passthrough", "multiplier", or "exclude"`);
    return undefined;
  }
  const candidate = raw as { kind?: unknown; factor?: unknown; reason?: unknown };
  if (candidate.kind === 'passthrough') {
    return { kind: 'passthrough' };
  }
  if (candidate.kind === 'multiplier') {
    if (typeof candidate.factor === 'string') {
      const parsed = DecimalValue.parse(candidate.factor);
      if (!parsed.ok) {
        problems.push(`${label}: factor "${candidate.factor}" is not a valid decimal`);
        return undefined;
      }
      return { kind: 'multiplier', factor: parsed.value };
    }
    problems.push(`${label}: factor must be a decimal string`);
    return undefined;
  }
  if (candidate.kind === 'exclude') {
    if (typeof candidate.reason !== 'string' || candidate.reason.trim().length === 0) {
      problems.push(`${label}: exclude action requires a non-empty reason`);
      return undefined;
    }
    return { kind: 'exclude', reason: candidate.reason };
  }
  problems.push(`${label}: modifier action kind must be "passthrough", "multiplier", or "exclude"`);
  return undefined;
}

function actionToJson(action: ModifierAction): ActionJson {
  if (action.kind === 'multiplier') {
    return { factor: action.factor.toJSON(), kind: 'multiplier' };
  }
  if (action.kind === 'exclude') {
    return { kind: 'exclude', reason: action.reason };
  }
  return { kind: 'passthrough' };
}

function canonicalOf(config: CreditingPolicyConfig): CreditingPolicyJson {
  return {
    correctionRule: config.correctionRule,
    dateBasis: config.dateBasis,
    maxUnitsPerLine: config.maxUnitsPerLine,
    modifiers: {
      combinations: [...config.modifiers.combinations]
        .map((entry) => ({
          action: actionToJson(entry.action),
          ...(entry.code === undefined ? {} : { code: entry.code }),
          modifiers: normalizeModifiers(entry.modifiers)
        }))
        .sort(compareCombinationJson),
      perModifier: Object.keys(config.modifiers.perModifier)
        .sort()
        .reduce<Record<string, ActionJson>>((acc, key) => {
          const action = config.modifiers.perModifier[key];
          if (action !== undefined) {
            acc[key] = actionToJson(action);
          }
          return acc;
        }, {}),
      scoped: [...config.modifiers.scoped]
        .map((entry) => ({ action: actionToJson(entry.action), code: entry.code, modifier: entry.modifier.trim().toUpperCase() }))
        .sort((left, right) => (left.code === right.code ? left.modifier.localeCompare(right.modifier) : left.code.localeCompare(right.code)))
    },
    policyId: config.policyId,
    scheduleBasis:
      config.scheduleBasis.kind === 'fixed'
        ? { kind: 'fixed', scheduleVersionId: config.scheduleBasis.scheduleVersionId }
        : { kind: 'service_date' },
    statusRules: {
      final: config.statusRules.final,
      pending: config.statusRules.pending,
      voided: config.statusRules.voided
    }
  };
}

function compareCombinationJson(
  left: { readonly action: ActionJson; readonly code?: string; readonly modifiers: readonly string[] },
  right: { readonly action: ActionJson; readonly code?: string; readonly modifiers: readonly string[] }
): number {
  const leftCode = left.code ?? '';
  const rightCode = right.code ?? '';
  if (leftCode !== rightCode) {
    return leftCode.localeCompare(rightCode);
  }
  return left.modifiers.join(',').localeCompare(right.modifiers.join(','));
}
