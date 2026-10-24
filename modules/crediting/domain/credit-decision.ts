import type { DecimalValue, JsonValue, LocalDate } from '@rvu/shared-kernel';
import type { LineStatus, ProviderId } from './service-line-version';

export const REVIEW_REASONS = [
  'provider_unmapped',
  'invalid_units',
  'schedule_mismatch',
  'code_not_in_schedule',
  'no_rvu_value',
  'ambiguous_multipliers',
  'modifier_not_supported',
  'status_requires_review',
  'no_schedule_available'
] as const;

export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const EXCLUSION_REASONS = ['status_excluded', 'modifier_excluded'] as const;

export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export interface CreditTrace {
  readonly code: string;
  readonly status: LineStatus;
  readonly serviceDate: LocalDate;
  readonly postedDate: LocalDate;
  readonly units: number;
  readonly modifiers: readonly string[];
  readonly creditDate: LocalDate;
  readonly factor: DecimalValue;
  readonly workRvu: DecimalValue | null;
}

export interface CreditedDecision {
  readonly kind: 'Credited';
  readonly wrvu: DecimalValue;
  readonly rule: string;
  readonly providerId: ProviderId;
  readonly creditDate: LocalDate;
  readonly scheduleVersionId: string;
  readonly policyId: string;
  readonly trace: CreditTrace;
}

export interface ReviewDecision {
  readonly kind: 'NeedsReview';
  readonly reason: ReviewReason;
  readonly providerId: ProviderId | null;
  readonly creditDate: LocalDate;
  readonly scheduleVersionId: string | null;
  readonly policyId: string;
  readonly detail: string;
  readonly trace: CreditTrace;
}

export interface ExcludedDecision {
  readonly kind: 'Excluded';
  readonly reason: ExclusionReason;
  readonly providerId: ProviderId | null;
  readonly creditDate: LocalDate;
  readonly scheduleVersionId: string | null;
  readonly policyId: string;
  readonly detail: string;
  readonly trace: CreditTrace;
}

export type CreditDecision = CreditedDecision | ReviewDecision | ExcludedDecision;

export type CreditDecisionKind = CreditDecision['kind'];

export function decisionToJson(decision: CreditDecision): JsonValue {
  const trace = {
    code: decision.trace.code,
    creditDate: decision.trace.creditDate.toString(),
    factor: decision.trace.factor.toJSON(),
    modifiers: [...decision.trace.modifiers],
    postedDate: decision.trace.postedDate.toString(),
    serviceDate: decision.trace.serviceDate.toString(),
    status: decision.trace.status,
    units: decision.trace.units,
    workRvu: decision.trace.workRvu === null ? null : decision.trace.workRvu.toJSON()
  };
  const shared = {
    creditDate: decision.creditDate.toString(),
    policyId: decision.policyId,
    providerId: decision.providerId,
    scheduleVersionId: decision.scheduleVersionId,
    trace
  };
  if (decision.kind === 'Credited') {
    return {
      kind: decision.kind,
      rule: decision.rule,
      wrvu: decision.wrvu.toJSON(),
      ...shared
    };
  }
  return {
    kind: decision.kind,
    reason: decision.reason,
    detail: decision.detail,
    ...shared
  };
}
