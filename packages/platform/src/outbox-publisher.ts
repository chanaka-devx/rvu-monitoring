import { sql } from 'kysely';
import type { DomainEvent, EventPublisher } from '@rvu/shared-kernel';
import { currentContext } from './execution-context';
import type { PgUnitOfWork } from './unit-of-work';

export class PgOutboxPublisher<DB> implements EventPublisher {
  constructor(private readonly uow: PgUnitOfWork<DB>) {}
  async publish(events: readonly DomainEvent[]): Promise<void> {
    if (!this.uow.isActive()) throw new Error('Publishing requires an active Unit of Work');
    const context = currentContext();
    if (!context.practiceId) throw new Error('Publishing requires a tenant');
    for (const event of events) {
      await sql`insert into platform.outbox
        (event_id, practice_id, event_type, aggregate_type, aggregate_id, schema_version, payload, correlation_id, occurred_at)
        values (${event.eventId}::uuid, ${context.practiceId}::uuid, ${event.eventType}, ${event.aggregateType},
        ${event.aggregateId}, ${event.schemaVersion}, ${JSON.stringify(event.payload)}::jsonb,
        ${context.correlationId ?? null}, ${event.occurredAt})`.execute(this.uow.getExecutor());
    }
  }
}
