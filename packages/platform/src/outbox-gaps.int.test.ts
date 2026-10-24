import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { appDatabaseUrl, useTestDatabase } from '@rvu/testing';
import { FixedClock } from '../../testing/src/fixed-clock';
import type { DomainEvent, PracticeId, Uuid } from '@rvu/shared-kernel';
import { createPool } from './pool';
import { createDb } from './database';
import { ensureAppRole } from './roles';
import { discoverMigrationSources } from './migrations/discovery';
import { runMigrations } from './migrations/runner';
import { PgUnitOfWork } from './unit-of-work';
import { runWithContext } from './execution-context';
import { EventBus } from './event-bus';
import { PgOutboxPublisher } from './outbox-publisher';
import { OutboxDispatcher } from './outbox-dispatcher';

const database = useTestDatabase();
const tenant = '01900000-0000-7000-8000-000000000001' as PracticeId;
const epoch = new Date('2030-01-01T00:00:00Z');
let owner: ReturnType<typeof createPool>;
let runtime: ReturnType<typeof createPool>;
let db: ReturnType<typeof createDb<Record<string, never>>>;
let uow: PgUnitOfWork<Record<string, never>>;
let publisher: PgOutboxPublisher<Record<string, never>>;
let dispatcher: OutboxDispatcher<Record<string, never>>;
let bus: EventBus;
let clock: FixedClock;

function event(n: number, aggregateId = `aggregate-${n}`): DomainEvent {
  return { eventId: `01900000-0000-7000-8000-${String(n).padStart(12, '0')}` as Uuid,
    eventType: 'gap.created', aggregateType: 'Gap', aggregateId,
    schemaVersion: 1, payload: { privateValue: 'payload-must-not-be-persisted-in-errors' }, occurredAt: clock.now() };
}
async function publish(...events: DomainEvent[]) {
  await runWithContext({ practiceId: tenant }, () => uow.run(() => publisher.publish(events)));
}
async function row(id: string) {
  return (await owner.query('select * from platform.outbox where event_id = $1', [id])).rows[0];
}
beforeAll(async () => {
  owner = createPool(database.url);
  await ensureAppRole(owner, { password: 'p2f-outbox-password' });
  await runMigrations({ pool: owner, sources: discoverMigrationSources(process.cwd()) });
  runtime = createPool(appDatabaseUrl(database.url, 'p2f-outbox-password'), { max: 1 });
  db = createDb(runtime);
  uow = new PgUnitOfWork(db);
  publisher = new PgOutboxPublisher(uow);
  await owner.query(`CREATE FUNCTION platform.p2f_reject_ack() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'simulated crash before acknowledgement'; END $$;`);
});
beforeEach(async () => {
  await owner.query('TRUNCATE platform.outbox, platform.inbox RESTART IDENTITY');
  clock = new FixedClock();
  clock.set(epoch);
  bus = new EventBus();
  dispatcher = new OutboxDispatcher(runtime, uow, bus, clock, {
    maxAttempts: 4, backoffBaseMs: 1000, backoffMaxMs: 2500
  });
});
afterEach(async () => {
  await dispatcher?.stop();
  await owner.query('DROP TRIGGER IF EXISTS p2f_ack_fault ON platform.outbox');
});
afterAll(async () => { await db?.destroy(); await owner?.end(); });

it('leaves zero outbox rows on rollback and exactly one on commit', async () => {
  const rolledBack = event(1);
  await expect(runWithContext({ practiceId: tenant }, () => uow.run(async () => {
    await publisher.publish([rolledBack]);
    throw new Error('rollback');
  }))).rejects.toThrow('rollback');
  expect((await owner.query('select count(*)::int as count from platform.outbox')).rows[0].count).toBe(0);
  const committed = event(2);
  await publish(committed);
  expect((await owner.query('select event_id, published_at from platform.outbox')).rows)
    .toEqual([{ event_id: committed.eventId, published_at: null }]);
});

it('delivers exactly once to each of two consumers and does not redeliver', async () => {
  const calls: string[] = [];
  for (const consumer of ['first', 'second']) bus.subscribe({ consumer, eventType: 'gap.created',
    handler: async (stored) => { calls.push(`${consumer}:${stored.eventId}`); } });
  const stored = event(1);
  await publish(stored);
  await dispatcher.dispatchOnce();
  expect(calls).toEqual([`first:${stored.eventId}`, `second:${stored.eventId}`]);
  expect((await row(stored.eventId)).published_at).toBeInstanceOf(Date);
  await dispatcher.dispatchOnce();
  expect(calls).toEqual([`first:${stored.eventId}`, `second:${stored.eventId}`]);
  expect((await owner.query('select consumer from platform.inbox order by consumer')).rows)
    .toEqual([{ consumer: 'first' }, { consumer: 'second' }]);
});

it('does not rerun inbox consumers after failure before published_at is set', async () => {
  const calls: string[] = [];
  for (const consumer of ['first', 'second']) bus.subscribe({ consumer, eventType: 'gap.created',
    handler: async () => { calls.push(consumer); } });
  const stored = event(1);
  await publish(stored);
  await owner.query(`CREATE TRIGGER p2f_ack_fault BEFORE UPDATE OF published_at ON platform.outbox
    FOR EACH ROW WHEN (NEW.published_at IS NOT NULL) EXECUTE FUNCTION platform.p2f_reject_ack()`);
  await dispatcher.dispatchOnce();
  expect(calls).toEqual(['first', 'second']);
  expect((await row(stored.eventId)).published_at).toBeNull();
  expect((await owner.query('select count(*)::int as count from platform.inbox')).rows[0].count).toBe(2);
  await owner.query('DROP TRIGGER p2f_ack_fault ON platform.outbox');
  clock.advance(1000);
  await dispatcher.dispatchOnce();
  expect(calls).toEqual(['first', 'second']);
  expect((await row(stored.eventId)).published_at).toEqual(clock.now());
});

it('backs off exponentially with a cap, hides payloads, and dies at the maximum attempts', async () => {
  let calls = 0;
  bus.subscribe({ consumer: 'failing', eventType: 'gap.created', handler: async (stored) => {
    calls += 1;
    throw new Error(JSON.stringify(stored.payload));
  } });
  const stored = event(1);
  await publish(stored);
  for (const [index, delay] of [1000, 2000, 2500, 2500].entries()) {
    await dispatcher.dispatchOnce();
    const failed = await row(stored.eventId);
    expect(failed.attempts).toBe(index + 1);
    expect(failed.next_attempt_at).toEqual(new Date(clock.now().getTime() + delay));
    expect(failed.last_error).toEqual(expect.any(String));
    expect(failed.last_error.length).toBeGreaterThan(0);
    expect(failed.last_error).not.toContain('payload-must-not-be-persisted-in-errors');
    expect(failed.last_error).not.toContain(JSON.stringify(stored.payload));
    expect(failed.dead_at).toEqual(index === 3 ? clock.now() : null);
    if (index < 3) {
      clock.advance(delay - 1);
      await dispatcher.dispatchOnce();
      expect(calls).toBe(index + 1);
      clock.advance(1);
    }
  }
  clock.advance(100_000);
  await dispatcher.dispatchOnce();
  expect(calls).toBe(4);
  expect((await owner.query('select * from platform.inbox')).rows).toEqual([]);
});

it('blocks only the failing aggregate and releases its follower after the head is dead', async () => {
  const head = event(1, 'same');
  const follower = event(2, 'same');
  const independent = event(3, 'other');
  const calls: string[] = [];
  bus.subscribe({ consumer: 'projection', eventType: 'gap.created', handler: async (stored) => {
    calls.push(stored.eventId);
    if (stored.eventId === head.eventId) throw new Error('failure');
  } });
  await publish(head, follower, independent);
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await dispatcher.dispatchOnce();
    expect(calls).not.toContain(follower.eventId);
    expect((await row(head.eventId)).attempts).toBe(attempt);
    expect((await row(independent.eventId)).published_at).not.toBeNull();
    clock.advance(5000);
  }
  expect((await row(head.eventId)).dead_at).not.toBeNull();
  await dispatcher.dispatchOnce();
  expect(calls.filter((id) => id === independent.eventId)).toHaveLength(1);
  expect(calls.filter((id) => id === follower.eventId)).toHaveLength(1);
});

it('reports pending count, dead count and oldest pending age including empty pending state', async () => {
  expect(await dispatcher.getOutboxStats()).toEqual({ pending: 0, dead: 0, oldestPendingAgeMs: null });
  await publish(event(1), event(2), event(3), event(4));
  await owner.query(`UPDATE platform.outbox SET created_at = $1 WHERE event_id = $2`, [new Date(epoch.getTime() - 5000), event(1).eventId]);
  await owner.query(`UPDATE platform.outbox SET created_at = $1, next_attempt_at = $2, attempts = 2 WHERE event_id = $3`,
    [new Date(epoch.getTime() - 2000), new Date(epoch.getTime() + 10000), event(2).eventId]);
  await owner.query(`UPDATE platform.outbox SET created_at = $1, dead_at = $2 WHERE event_id = $3`,
    [new Date(epoch.getTime() - 100000), epoch, event(3).eventId]);
  await owner.query(`UPDATE platform.outbox SET created_at = $1, published_at = $2 WHERE event_id = $3`,
    [new Date(epoch.getTime() - 100000), epoch, event(4).eventId]);
  expect(await dispatcher.getOutboxStats()).toEqual({ pending: 2, dead: 1, oldestPendingAgeMs: 5000 });
  clock.advance(250);
  expect(await dispatcher.getOutboxStats()).toEqual({ pending: 2, dead: 1, oldestPendingAgeMs: 5250 });
  await owner.query('UPDATE platform.outbox SET published_at = $1 WHERE dead_at IS NULL', [clock.now()]);
  expect(await dispatcher.getOutboxStats()).toEqual({ pending: 0, dead: 1, oldestPendingAgeMs: null });
});
