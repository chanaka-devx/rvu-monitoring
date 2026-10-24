import type { PracticeId } from '../brand';

export interface CurrentTenant {
  requirePracticeId(): PracticeId;
}
