import { Client, type Pool } from 'pg';
import { sql } from 'kysely';
import type { Clock, PracticeId, Uuid, JsonValue } from '@rvu/shared-kernel';
import { EventBus, type StoredEvent } from './event-bus';
import { runWithContext } from './execution-context';
import type { PgUnitOfWork } from './unit-of-work';

export interface OutboxOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
}
interface Row {
  sequence: string; event_id: Uuid; practice_id: PracticeId; event_type: string;
  aggregate_type: string; aggregate_id: string; schema_version: number;
  payload: JsonValue; correlation_id: string | null; occurred_at: Date; attempts: number;
}
const LOCK = 70011003;

export class OutboxDispatcher<DB> {
  private leader: Client | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private inFlight: Promise<void> | undefined;
  private stopping = false;
  constructor(private readonly pool: Pool, private readonly uow: PgUnitOfWork<DB>,
    private readonly bus: EventBus, private readonly clock: Clock,
    private readonly options: OutboxOptions = {},
    private readonly onError: (error: unknown) => void = () => {}) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    const poll = async () => {
      try { await this.dispatchOnce(); } catch (error) { this.onError(error); }
      if (this.running) this.timer = setTimeout(() => { void poll(); }, this.options.pollIntervalMs ?? 1000);
    };
    void poll();
  }
  async stop(): Promise<void> {
    this.running = false;
    this.stopping = true;
    clearTimeout(this.timer);
    await this.inFlight;
    if (this.leader) {
      const client = this.leader;
      this.leader = undefined;
      try { await client.query('select pg_advisory_unlock($1)', [LOCK]); }
      finally { await client.end(); }
    }
  }
  async dispatchOnce(): Promise<void> {
    if (this.stopping) return;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.dispatch();
    try { await this.inFlight; } finally { this.inFlight = undefined; }
  }
  private async dispatch(): Promise<void> {
    if (!this.leader) {
      const client = new Client(this.pool.options);
      await client.connect();
      let result;
      try { result = await client.query('select pg_try_advisory_lock($1) as acquired', [LOCK]); }
      catch (error) { await client.end(); throw error; }
      if (!result.rows[0]?.acquired) { await client.end(); return; }
      this.leader = client;
      client.on('error', (error) => {
        if (this.leader === client) { this.leader = undefined; void client.end().catch(this.onError); }
        this.onError(error);
      });
    }
    const leader = this.leader;
    const now = this.clock.now();
    const result = await leader.query<Row>(`select o.* from platform.outbox o
      where o.published_at is null and o.dead_at is null and o.next_attempt_at <= $1
      and not exists (select 1 from platform.outbox earlier where
        earlier.practice_id = o.practice_id and earlier.aggregate_type = o.aggregate_type
        and earlier.aggregate_id = o.aggregate_id and earlier.sequence < o.sequence
        and earlier.published_at is null and earlier.dead_at is null)
      order by o.sequence limit $2`, [now, this.options.batchSize ?? 50]);
    for (const row of result.rows) {
      const event: StoredEvent = {
        eventId: row.event_id, practiceId: row.practice_id, eventType: row.event_type,
        aggregateType: row.aggregate_type, aggregateId: row.aggregate_id,
        schemaVersion: row.schema_version, payload: row.payload, occurredAt: row.occurred_at,
        ...(row.correlation_id === null ? {} : { correlationId: row.correlation_id })
      };
      try {
        for (const subscription of this.bus.subscriptions(event.eventType)) {
          await runWithContext({ practiceId: event.practiceId, ...(event.correlationId ? { correlationId: event.correlationId } : {}) }, () => this.uow.run(async () => {
            const inserted = await sql`insert into platform.inbox (consumer, event_id)
              values (${subscription.consumer}, ${event.eventId}::uuid)
              on conflict do nothing returning event_id`.execute(this.uow.getExecutor());
            if (inserted.rows.length) await subscription.handler(event);
          }));
        }
        await leader.query('update platform.outbox set published_at = $1 where sequence = $2', [this.clock.now(), row.sequence]);
      } catch {
        const attempts = row.attempts + 1;
        const delay = Math.min(this.options.backoffMaxMs ?? 60_000, (this.options.backoffBaseMs ?? 1000) * 2 ** Math.min(attempts - 1, 30));
        // Handler messages can contain payloads or secrets. Persist a fixed safe reason.
        await leader.query(`update platform.outbox set attempts = $1, last_error = $2,
          next_attempt_at = $3, dead_at = $4 where sequence = $5`, [attempts, 'Event delivery failed',
          new Date(this.clock.now().getTime() + delay), attempts >= (this.options.maxAttempts ?? 10) ? this.clock.now() : null, row.sequence]);
      }
    }
  }
  async getOutboxStats(): Promise<{ pending: number; dead: number; oldestPendingAgeMs: number | null }> {
    const result = await this.pool.query(`select
      count(*) filter (where published_at is null and dead_at is null)::int as pending,
      count(*) filter (where dead_at is not null)::int as dead,
      min(created_at) filter (where published_at is null and dead_at is null) as oldest from platform.outbox`);
    const row = result.rows[0];
    return { pending: row.pending, dead: row.dead,
      oldestPendingAgeMs: row.oldest ? Math.max(0, this.clock.now().getTime() - row.oldest.getTime()) : null };
  }
}
