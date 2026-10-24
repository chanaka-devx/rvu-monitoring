import type { LocalDate } from '@rvu/shared-kernel';
import type { CreditingPolicy } from './crediting-policy';
import type { ServiceLineVersion } from './service-line-version';

export type ScheduleBasisSelection =
  | { readonly kind: 'by_date'; readonly date: LocalDate }
  | { readonly kind: 'fixed'; readonly scheduleVersionId: string };

export function selectScheduleBasis(line: ServiceLineVersion, policy: CreditingPolicy): ScheduleBasisSelection {
  const basis = policy.config.scheduleBasis;
  return basis.kind === 'fixed'
    ? { kind: 'fixed', scheduleVersionId: basis.scheduleVersionId }
    : { kind: 'by_date', date: line.serviceDate };
}

export function creditDateOf(line: ServiceLineVersion, policy: CreditingPolicy): LocalDate {
  return policy.config.dateBasis === 'posting_date' ? line.postedDate : line.serviceDate;
}
