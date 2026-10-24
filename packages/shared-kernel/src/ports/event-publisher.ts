import type { DomainEvent } from '../domain-event';

export interface EventPublisher {
  publish(events: readonly DomainEvent[]): Promise<void>;
}
