import { afterAll, beforeAll, expect, it } from 'vitest';
import { useTestDatabase } from '@rvu/testing';
import { SystemClock, type PracticeId, type DomainEvent, type Uuid } from '@rvu/shared-kernel';
import { sql } from 'kysely';
import { createPool } from './pool';
import { createDb } from './database';
import { ensureAppRole } from './roles';
import { runMigrations } from './migrations/runner';
import { discoverMigrationSources } from './migrations/discovery';
import { PgUnitOfWork } from './unit-of-work';
import { currentContext, runWithContext } from './execution-context';
import { EventBus } from './event-bus';
import { PgOutboxPublisher } from './outbox-publisher';
import { OutboxDispatcher } from './outbox-dispatcher';

const database = useTestDatabase();
const tenant = '01900000-0000-7000-8000-000000000001' as PracticeId;
let pool: ReturnType<typeof createPool>;
let runtime: ReturnType<typeof createPool>;
let db: ReturnType<typeof createDb<Record<string, never>>>;
let uow: PgUnitOfWork<Record<string, never>>;
let publisher: PgOutboxPublisher<Record<string, never>>;
const bus = new EventBus();
let dispatcher: OutboxDispatcher<Record<string, never>>;
const calls: string[] = [];
let time = new Date('2030-01-01T00:00:00Z');
const clock = { now: () => new Date(time) };
function event(n: number, aggregateId = 'aggregate'): DomainEvent {
  return { eventId: `01900000-0000-7000-8000-${String(n).padStart(12, '0')}` as Uuid,
    eventType: 'created', aggregateType: 'Test', aggregateId, schemaVersion: 1,
    payload: {}, occurredAt: new SystemClock().now() };
}
beforeAll(async () => {
  pool = createPool(database.url);
  await ensureAppRole(pool, { password: 'test-only-password' });
  await runMigrations({ pool, sources: discoverMigrationSources(process.cwd()) });
  await pool.query(`CREATE SCHEMA outbox_test;
    CREATE TABLE outbox_test.tenant_rows (practice_id uuid not null);
    INSERT INTO outbox_test.tenant_rows VALUES ('${tenant}'), ('01900000-0000-7000-8000-000000000002');
    GRANT USAGE ON SCHEMA outbox_test TO rvu_app;
    GRANT SELECT ON outbox_test.tenant_rows TO rvu_app;
    SELECT platform.enable_tenant_rls('outbox_test', 'tenant_rows');`);
  const runtimeUrl = new URL(database.url);
  runtimeUrl.username = 'rvu_app';
  runtimeUrl.password = 'test-only-password';
  runtime = createPool(runtimeUrl.toString());
  db = createDb(runtime);
  uow = new PgUnitOfWork(db);
  publisher = new PgOutboxPublisher(uow);
  dispatcher = new OutboxDispatcher(runtime, uow, bus, clock, { maxAttempts: 2 });
  bus.subscribe({ consumer: 'a', eventType: 'created', handler: async (stored) => {
    expect(currentContext().practiceId).toBe(tenant);
    const visible = await sql<{ practice_id: string }>`select practice_id from outbox_test.tenant_rows`.execute(uow.getExecutor());
    expect(visible.rows).toEqual([{ practice_id: tenant }]);
    calls.push(`a:${stored.eventId}`);
    if (stored.aggregateId === 'fail') throw new Error('secret payload');
  } });
  bus.subscribe({ consumer: 'b', eventType: 'created', handler: async (stored) => { calls.push(`b:${stored.eventId}`); } });
});
afterAll(async () => { await dispatcher?.stop(); await db?.destroy(); await pool?.end(); });

it('requires tenant and UoW, rolls back publication, and delivers committed events once per consumer', async () => {
  await expect(publisher.publish([event(1)])).rejects.toThrow(/Unit of Work/);
  await expect(uow.run(() => publisher.publish([event(1)]))).rejects.toThrow(/tenant/);
  await expect(runWithContext({ practiceId: tenant }, () => uow.run(async () => {
    await publisher.publish([event(1)]); throw new Error('rollback');
  }))).rejects.toThrow('rollback');
  expect((await pool.query('select * from platform.outbox')).rows).toHaveLength(0);
  await runWithContext({ practiceId: tenant }, () => uow.run(() => publisher.publish([event(2)])));
  await dispatcher.dispatchOnce();
  await dispatcher.dispatchOnce();
  expect(calls).toHaveLength(2);
  // Simulate a crash after consumer transactions committed but before the acknowledgement.
  await pool.query('update platform.outbox set published_at = null');
  await dispatcher.dispatchOnce();
  expect(calls).toHaveLength(2);
});

it('backs off failures, preserves aggregate ordering, and elects one dispatcher', async () => {
  await runWithContext({ practiceId: tenant }, () => uow.run(() => publisher.publish([
    event(3, 'fail'), event(4, 'fail'), event(5, 'other')
  ])));
  const other = new OutboxDispatcher(runtime, uow, bus, clock);
  try { await other.dispatchOnce(); expect(calls).toHaveLength(2); }
  finally { await other.stop(); }
  await dispatcher.dispatchOnce();
  expect(calls.some((call) => call.endsWith(event(5).eventId))).toBe(true);
  expect(calls.some((call) => call.endsWith(event(4).eventId))).toBe(false);
  const attempts = await pool.query('select attempts, last_error from platform.outbox where event_id = $1', [event(3).eventId]);
  expect(attempts.rows[0]).toEqual({ attempts: 1, last_error: 'Event delivery failed' });
  await dispatcher.dispatchOnce();
  expect((await pool.query('select attempts from platform.outbox where event_id = $1', [event(3).eventId])).rows[0].attempts).toBe(1);
  time = new Date(time.getTime() + 2000);
  await dispatcher.dispatchOnce();
  expect((await dispatcher.getOutboxStats()).dead).toBe(1);
  await dispatcher.dispatchOnce();
  expect(calls.some((call) => call.endsWith(event(4).eventId))).toBe(true);
});

it('delivers successive events of one aggregate in sequence order', async () => {
  await runWithContext({ practiceId: tenant }, () => uow.run(() => publisher.publish([event(6, 'ordered'), event(7, 'ordered')])));
  await dispatcher.dispatchOnce();
  expect(calls.some((call) => call.endsWith(event(6).eventId))).toBe(true);
  expect(calls.some((call) => call.endsWith(event(7).eventId))).toBe(false);
  await dispatcher.dispatchOnce();
  expect(calls.indexOf(`a:${event(6).eventId}`)).toBeLessThan(calls.indexOf(`a:${event(7).eventId}`));
});
