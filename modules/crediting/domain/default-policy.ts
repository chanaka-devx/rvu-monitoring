import type { DomainError, Result } from '@rvu/shared-kernel';
import { CreditingPolicy } from './crediting-policy';

export function defaultPolicy(policyId: string): Result<CreditingPolicy, DomainError> {
  return CreditingPolicy.create({
    policyId,
    dateBasis: 'service_date',
    scheduleBasis: { kind: 'service_date' },
    statusRules: { final: 'credit', pending: 'exclude', voided: 'exclude' },
    maxUnitsPerLine: 1000,
    modifiers: { combinations: [], perModifier: {}, scoped: [] },
    correctionRule: 'original_period_while_open'
  });
}
