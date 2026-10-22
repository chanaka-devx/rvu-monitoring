import { describe, expect, it } from 'vitest';
import { AggregateRoot } from './aggregate-root';
import type { Uuid } from './brand';
import type { DomainEvent } from './domain-event';

const asUuid = (value: string): Uuid => value as Uuid;

const event = (id: number): DomainEvent => ({
  eventId: asUuid(`00000000-0000-0000-0000-${String(id).padStart(12, '0')}`),
  eventType: 'test/happened',
  aggregateType: 'TestAggregate',
  aggregateId: 'aggregate-1',
  occurredAt: new Date(0),
  schemaVersion: 1,
  payload: { id }
});

class TestAggregate extends AggregateRoot<string> {}

describe('AggregateRoot', () => {
  it('starts at version 0', () => {
    expect(new TestAggregate('aggregate-1').version).toBe(0);
  });

  it('is an entity with an id', () => {
    expect(new TestAggregate('aggregate-1').id).toBe('aggregate-1');
    expect(new TestAggregate('aggregate-1').equals(new TestAggregate('aggregate-1'))).toBe(true);
  });

  it('collects recorded domain events in order', () => {
    const aggregate = new TestAggregate('aggregate-1');
    const first = event(1);
    const second = event(2);
    aggregate.addDomainEvent(first);
    aggregate.addDomainEvent(second);
    const pulled = aggregate.pullDomainEvents();
    expect(pulled).toEqual([first, second]);
  });

  it('pullDomainEvents clears the buffer', () => {
    const aggregate = new TestAggregate('aggregate-1');
    aggregate.addDomainEvent(event(1));
    expect(aggregate.pullDomainEvents()).toHaveLength(1);
    expect(aggregate.pullDomainEvents()).toHaveLength(0);
    expect(aggregate.pullDomainEvents()).toEqual([]);
  });

  it('keeps pulled events independent from later additions', () => {
    const aggregate = new TestAggregate('aggregate-1');
    const first = event(1);
    aggregate.addDomainEvent(first);
    const pulled = aggregate.pullDomainEvents();
    aggregate.addDomainEvent(event(2));
    expect(pulled).toEqual([first]);
    expect(aggregate.pullDomainEvents()).toHaveLength(1);
  });
});
