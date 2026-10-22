import type { Clock } from './clock';
import type { IdGenerator } from './id-generator';
import type { Uuid } from './brand';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface DomainEvent {
  readonly eventId: Uuid;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly schemaVersion: number;
  readonly payload: JsonValue;
  readonly correlationId?: string;
}

export interface DomainEventInput {
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly schemaVersion: number;
  readonly payload: JsonValue;
  readonly correlationId?: string;
}

export function createDomainEvent(
  input: DomainEventInput,
  clock: Clock,
  ids: IdGenerator
): DomainEvent {
  const base: DomainEvent = {
    eventId: ids.next(),
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    occurredAt: clock.now(),
    schemaVersion: input.schemaVersion,
    payload: input.payload
  };
  return input.correlationId === undefined ? base : { ...base, correlationId: input.correlationId };
}
