import { describe, expect, it } from 'vitest';
import type { Uuid } from './brand';
import type { Clock } from './clock';
import { createDomainEvent, type DomainEvent, type JsonValue } from './domain-event';
import type { IdGenerator } from './id-generator';

class FixedClock implements Clock {
  constructor(private readonly moment: Date) {}
  now(): Date {
    return this.moment;
  }
}

class SequentialIds implements IdGenerator {
  private nextNumber = 1;
  next(): Uuid {
    const id = String(this.nextNumber).padStart(12, '0');
    this.nextNumber += 1;
    return `01906d0e-0000-7000-8000-${id}` as Uuid;
  }
}

const clock = new FixedClock(new Date('2026-10-22T18:00:00Z'));

describe('createDomainEvent', () => {
  const ids = new SequentialIds();

  it('fills in eventId and occurredAt from the ports', () => {
    const event = createDomainEvent(
      {
        eventType: 'ServiceLineAccepted',
        aggregateType: 'ImportBatch',
        aggregateId: '01906d0e-0000-7000-8000-000000000000',
        schemaVersion: 1,
        payload: { practiceId: 'practice-1' }
      },
      clock,
      ids
    );
    expect(event.eventId).toBe('01906d0e-0000-7000-8000-000000000001');
    expect(event.occurredAt).toEqual(new Date('2026-10-22T18:00:00Z'));
  });

  it('copies the identity and payload fields', () => {
    const event = createDomainEvent(
      {
        eventType: 'ServiceLineAccepted',
        aggregateType: 'ImportBatch',
        aggregateId: '01906d0e-0000-7000-8000-000000000000',
        schemaVersion: 2,
        payload: { lineId: 'line-1' }
      },
      clock,
      ids
    );
    expect(event.eventType).toBe('ServiceLineAccepted');
    expect(event.aggregateType).toBe('ImportBatch');
    expect(event.aggregateId).toBe('01906d0e-0000-7000-8000-000000000000');
    expect(event.schemaVersion).toBe(2);
    expect(event.payload).toEqual({ lineId: 'line-1' });
  });

  it('carries an optional correlation id', () => {
    const withCorrelation = createDomainEvent(
      {
        eventType: 'ServiceLineAccepted',
        aggregateType: 'ImportBatch',
        aggregateId: 'a',
        schemaVersion: 1,
        payload: {},
        correlationId: 'corr-1'
      },
      clock,
      ids
    );
    expect(withCorrelation.correlationId).toBe('corr-1');

    const withoutCorrelation = createDomainEvent(
      {
        eventType: 'ServiceLineAccepted',
        aggregateType: 'ImportBatch',
        aggregateId: 'a',
        schemaVersion: 1,
        payload: {}
      },
      clock,
      ids
    );
    expect(withoutCorrelation.correlationId).toBeUndefined();
    expect('correlationId' in withoutCorrelation).toBe(false);
  });

  it('is deterministic for a fixed clock and a sequential id generator', () => {
    const makeEvent = (ids: SequentialIds): DomainEvent =>
      createDomainEvent(
        {
          eventType: 'CreditEntryPosted',
          aggregateType: 'CreditLedger',
          aggregateId: '01906d0e-0000-7000-8000-000000000009',
          schemaVersion: 1,
          payload: { amount: '73.60' }
        },
        clock,
        ids
      );
    expect(makeEvent(new SequentialIds())).toEqual(makeEvent(new SequentialIds()));
  });
});

describe('JsonValue', () => {
  it('accepts JSON-compatible payloads', () => {
    const deep: JsonValue = {
      nested: [1, 'two', null, true, { more: [] }],
      plain: 'value'
    };
    expect(JSON.parse(JSON.stringify(deep))).toEqual({
      nested: [1, 'two', null, true, { more: [] }],
      plain: 'value'
    });
  });
});
