import type { DomainEvent } from './domain-event';
import { Entity } from './entity';

export abstract class AggregateRoot<Id> extends Entity<Id> {
  private readonly events: DomainEvent[] = [];

  private versionCounter = 0;

  get version(): number {
    return this.versionCounter;
  }

  addDomainEvent(event: DomainEvent): void {
    this.events.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const pulled = [...this.events];
    this.events.length = 0;
    return pulled;
  }
}
