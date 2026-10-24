import type { Brand } from '@rvu/shared-kernel';
import type { LocalDate } from '@rvu/shared-kernel';

export type ProviderId = Brand<string, 'ProviderId'>;

export type LineStatus = 'final' | 'pending' | 'voided';

export const LINE_STATUSES = ['final', 'pending', 'voided'] as const satisfies readonly LineStatus[];

export interface ServiceLineVersion {
  readonly serviceLineId: string;
  readonly version: string;
  readonly code: string;
  readonly serviceDate: LocalDate;
  readonly postedDate: LocalDate;
  readonly providerId: ProviderId | null;
  readonly units: number;
  readonly modifiers: readonly string[];
  readonly status: LineStatus;
}
