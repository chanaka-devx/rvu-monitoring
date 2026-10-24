import type { DomainEvent, PracticeId } from '@rvu/shared-kernel';

export interface StoredEvent extends DomainEvent {
  readonly practiceId: PracticeId;
}
export interface Subscription {
  readonly consumer: string;
  readonly eventType: string;
  readonly handler: (event: StoredEvent) => Promise<void>;
}
export class EventBus {
  private readonly entries: Subscription[] = [];
  subscribe(subscription: Subscription): void {
    if (this.entries.some((entry) => entry.consumer === subscription.consumer && entry.eventType === subscription.eventType)) {
      throw new Error('Duplicate event consumer subscription');
    }
    this.entries.push(Object.freeze({ ...subscription }));
  }
  subscriptions(eventType: string): readonly Subscription[] {
    return this.entries.filter((entry) => entry.eventType === eventType);
  }
}
