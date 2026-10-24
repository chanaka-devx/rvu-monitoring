import { afterAll, beforeAll, expect, it } from 'vitest';
import { useTestDatabase } from '@rvu/testing';
import type { PracticeId } from '@rvu/shared-kernel';
import { sql } from 'kysely';
import { createPool } from './pool';
import { createDb } from './database';
import { ensureAppRole } from './roles';
import { PgUnitOfWork, AsyncLocalStorageCurrentTenant } from './unit-of-work';
import { runWithContext } from './execution-context';
import { discoverMigrationSources } from './migrations/discovery';
import { runMigrations } from './migrations/runner';

const database = useTestDatabase();
const a = '01900000-0000-7000-8000-000000000001' as PracticeId;
const b = '01900000-0000-7000-8000-000000000002' as PracticeId;
let owner: ReturnType<typeof createPool>;
let app: ReturnType<typeof createPool>;
let db: ReturnType<typeof createDb<Record<string, never>>>;
let uow: PgUnitOfWork<Record<string, never>>;

beforeAll(async () => {
  owner = createPool(database.url);
  await ensureAppRole(owner, { password: 'test-only-password' });
  await runMigrations({ pool: owner, sources: discoverMigrationSources(process.cwd()) });
  await owner.query(`CREATE SCHEMA tenant_test;
    CREATE TABLE tenant_test.rows (id int primary key, practice_id uuid not null);
    INSERT INTO tenant_test.rows VALUES (1, '${a}'), (2, '${b}');
    GRANT USAGE ON SCHEMA tenant_test TO rvu_app;
    GRANT SELECT, INSERT, UPDATE ON tenant_test.rows TO rvu_app;
    SELECT platform.enable_tenant_rls('tenant_test', 'rows');
    SELECT platform.enable_tenant_rls('tenant_test', 'rows');`);
  const url = new URL(database.url);
  url.username = 'rvu_app';
  url.password = 'test-only-password';
  app = createPool(url.toString(), { max: 1 });
  db = createDb(app);
  uow = new PgUnitOfWork(db);
});

afterAll(async () => {
  await db?.destroy();
  await owner?.end();
});

async function ids() {
  const result = await sql<{ id: number }>`select id from tenant_test.rows order by id`.execute(uow.getExecutor());
  return result.rows.map((row) => row.id);
}

it('fails closed without a tenant and restores transaction-local settings with pool max 1', async () => {
  expect(await ids()).toEqual([]);
  await runWithContext({ practiceId: a }, () => uow.run(async () => {
    expect(await ids()).toEqual([1]);
    expect(new AsyncLocalStorageCurrentTenant().requirePracticeId()).toBe(a);
  }));
  expect(await ids()).toEqual([]);
  expect(() => new AsyncLocalStorageCurrentTenant().requirePracticeId()).toThrow(/tenant/i);
});

it('commits, joins nested transactions, and rolls back on throw', async () => {
  await runWithContext({ practiceId: a }, () => uow.run(async () => {
    const executor = uow.getExecutor();
    await uow.run(async () => {
      expect(uow.getExecutor()).toBe(executor);
      await sql`insert into tenant_test.rows values (3, ${a}::uuid)`.execute(executor);
    });
  }));
  await expect(runWithContext({ practiceId: a }, () => uow.run(async () => {
    await sql`insert into tenant_test.rows values (4, ${a}::uuid)`.execute(uow.getExecutor());
    throw new Error('rollback');
  }))).rejects.toThrow('rollback');
  await runWithContext({ practiceId: a }, () => uow.run(async () => {
    expect(await ids()).toEqual([1, 3]);
  }));
});

it('rejects cross-tenant inserts and updates', async () => {
  for (const query of [
    sql`insert into tenant_test.rows values (5, ${b}::uuid)`,
    sql`update tenant_test.rows set practice_id = ${b}::uuid where id = 1`
  ]) {
    await expect(runWithContext({ practiceId: a }, () => uow.run(async () => {
      await query.execute(uow.getExecutor());
    }))).rejects.toThrow(/row-level security/);
  }
});

it('restricts the runtime role and denies schema and table creation', async () => {
  const role = await app.query("select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole from pg_roles where rolname = current_user");
  expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false });
  await expect(app.query('create schema forbidden')).rejects.toThrow(/permission denied/);
  await expect(app.query('create table platform.forbidden (id int)')).rejects.toThrow(/permission denied/);
});

it('FORCE subjects a non-superuser table owner to the policy', async () => {
  await owner.query(`CREATE ROLE tenant_owner NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE, CREATE ON SCHEMA tenant_test TO tenant_owner;
    GRANT USAGE ON SCHEMA platform TO tenant_owner;
    GRANT EXECUTE ON FUNCTION platform.current_practice_id() TO tenant_owner;
    ALTER TABLE tenant_test.rows OWNER TO tenant_owner;`);
  const client = await owner.connect();
  try {
    await client.query('SET ROLE tenant_owner');
    expect((await client.query('select * from tenant_test.rows')).rows).toEqual([]);
    await client.query('BEGIN');
    await client.query("select set_config('app.practice_id', $1, true)", [b]);
    expect((await client.query('select id from tenant_test.rows')).rows).toEqual([{ id: 2 }]);
    await client.query('COMMIT');
  } finally {
    await client.query('RESET ROLE');
    client.release();
  }
});
