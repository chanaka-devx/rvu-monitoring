import { DecimalValue } from '@rvu/shared-kernel';
import type { DecimalValue as DecimalValueType, LocalDate } from '@rvu/shared-kernel';
import type { CreditDecision, CreditedDecision, ExcludedDecision, ExclusionReason, ReviewDecision, ReviewReason } from './credit-decision';
import type { CreditingPolicy } from './crediting-policy';
import type { LineStatus, ProviderId, ServiceLineVersion } from './service-line-version';
import { normalizeModifiers, resolveModifiers } from './modifier-rules';
import { unitFactor } from './modifier-rules';
import type { RvuScheduleView } from './rvu-schedule-view';
import { creditDateOf, selectScheduleBasis } from './schedule-selection';

export function decideCredit(line: ServiceLineVersion, schedule: RvuScheduleView | null, policy: CreditingPolicy): CreditDecision {
  const creditDate = creditDateOf(line, policy);
  const traceBasis = {
    code: line.code,
    creditDate,
    modifiers: normalizeModifiers(line.modifiers),
    postedDate: line.postedDate,
    serviceDate: line.serviceDate,
    status: line.status,
    units: line.units
  };
  const statusRule = policy.config.statusRules[line.status];
  if (statusRule === 'exclude') {
    return excluded(policy, 'status_excluded', `Status ${line.status} excluded by policy`, line.providerId, traceBasis);
  }
  if (statusRule === 'review') {
    return reviewing(policy, 'status_requires_review', `Status ${line.status} requires review`, line.providerId, traceBasis, unitFactor());
  }
  if (line.providerId === null) {
    return reviewing(policy, 'provider_unmapped', 'Line has no provider mapped', null, traceBasis, unitFactor());
  }
  const units = line.units;
  if (!Number.isInteger(units) || units < 1 || units > policy.config.maxUnitsPerLine) {
    return reviewing(
      policy,
      'invalid_units',
      `units ${String(units)} must be an integer between 1 and ${policy.config.maxUnitsPerLine}`,
      line.providerId,
      traceBasis,
      unitFactor()
    );
  }
  const modifierOutcome = resolveModifiers(line.code, line.modifiers, policy.config.modifiers);
  if (modifierOutcome.kind === 'exclude') {
    return excluded(
      policy,
      'modifier_excluded',
      `Modifier ${modifierOutcome.modifier} excluded by policy: ${modifierOutcome.reason}`,
      line.providerId,
      traceBasis
    );
  }
  if (modifierOutcome.kind === 'review') {
    return reviewing(
      policy,
      modifierOutcome.reason,
      modifierOutcome.reason === 'ambiguous_multipliers'
        ? `Modifiers ${modifierOutcome.modifiers.join(', ')} create ambiguous multipliers`
        : `Modifier(s) ${modifierOutcome.modifiers.join(', ')} not supported by policy`,
      line.providerId,
      traceBasis,
      unitFactor()
    );
  }
  const basis = selectScheduleBasis(line, policy);
  if (schedule === null) {
    return reviewing(policy, 'no_schedule_available', 'No RVU schedule is available', line.providerId, traceBasis, modifierOutcome.factor);
  }
  const versionId = schedule.versionId;
  if (basis.kind === 'fixed' ? versionId !== basis.scheduleVersionId : !schedule.effectiveRange.contains(basis.date)) {
    return reviewing(
      policy,
      'schedule_mismatch',
      basis.kind === 'fixed'
        ? `Schedule ${versionId} does not match policy schedule version ${basis.scheduleVersionId}`
        : `Schedule ${versionId} does not cover service date ${basis.date.toString()}`,
      line.providerId,
      traceBasis,
      modifierOutcome.factor
    );
  }
  const lookup = schedule.workRvuFor(line.code);
  if (lookup.kind === 'unknown_code') {
    return reviewing(policy, 'code_not_in_schedule', `Code ${line.code} not in schedule ${versionId}`, line.providerId, traceBasis, modifierOutcome.factor);
  }
  if (lookup.kind === 'no_value') {
    return reviewing(policy, 'no_rvu_value', `Code ${line.code} has no RVU value in schedule ${versionId}`, line.providerId, traceBasis, modifierOutcome.factor);
  }
  const workRvu = lookup.workRvu;
  const unrounded = workRvu.multiply(exactUnits(units)).multiply(modifierOutcome.factor);
  const wrvu = unrounded.round(4, 'HALF_UP');
  const decision: CreditedDecision = {
    kind: 'Credited',
    wrvu,
    rule: modifierOutcome.rule,
    providerId: line.providerId,
    creditDate,
    scheduleVersionId: versionId,
    policyId: policy.config.policyId,
    trace: { ...traceBasis, factor: modifierOutcome.factor, workRvu }
  };
  return decision;
}

export interface CreditCalculator {
  decide(line: ServiceLineVersion, schedule: RvuScheduleView | null, policy: CreditingPolicy): CreditDecision;
}

interface TraceBasis {
  readonly code: string;
  readonly creditDate: LocalDate;
  readonly modifiers: readonly string[];
  readonly postedDate: LocalDate;
  readonly serviceDate: LocalDate;
  readonly status: LineStatus;
  readonly units: number;
}

function reviewing(
  policy: CreditingPolicy,
  reason: ReviewReason,
  detail: string,
  providerId: ProviderId | null,
  traceBasis: TraceBasis,
  factor: DecimalValueType
): ReviewDecision {
  return {
    kind: 'NeedsReview',
    reason,
    providerId,
    creditDate: traceBasis.creditDate,
    scheduleVersionId: policy.config.scheduleBasis.kind === 'fixed' ? policy.config.scheduleBasis.scheduleVersionId : null,
    policyId: policy.config.policyId,
    detail,
    trace: { ...traceBasis, factor, workRvu: null }
  };
}

function excluded(
  policy: CreditingPolicy,
  reason: ExclusionReason,
  detail: string,
  providerId: ProviderId | null,
  traceBasis: TraceBasis
): ExcludedDecision {
  return {
    kind: 'Excluded',
    reason,
    providerId,
    creditDate: traceBasis.creditDate,
    scheduleVersionId: policy.config.scheduleBasis.kind === 'fixed' ? policy.config.scheduleBasis.scheduleVersionId : null,
    policyId: policy.config.policyId,
    detail,
    trace: { ...traceBasis, factor: unitFactor(), workRvu: null }
  };
}

function exactUnits(units: number): DecimalValue {
  const parsed = DecimalValue.fromInteger(units);
  return parsed.ok ? parsed.value : DecimalValue.zero();
}
