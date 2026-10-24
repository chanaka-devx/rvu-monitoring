import { afterAll, beforeAll, expect, it } from 'vitest';
import { appDatabaseUrl, useTestDatabase } from '@rvu/testing';
import type { PracticeId } from '@rvu/shared-kernel';
import { JobRunner } from './jobs';
import { createPool } from './pool';
import { ensureAppRole } from './roles';
import { runMigrations } from './migrations/runner';
import { discoverMigrationSources } from './migrations/discovery';
import { currentContext, runWithContext } from './execution-context';

const database = useTestDatabase();
let pool: ReturnType<typeof createPool>;
let jobs: JobRunner;
beforeAll(async () => {
  pool = createPool(database.url);
  await ensureAppRole(pool, { password: 'jobs-test-password' });
  await runMigrations({ pool, sources: discoverMigrationSources(process.cwd()) });
  // Queue DDL is provisioned by the owner, never by the runtime worker.
  await pool.query(`select pgboss.create_queue('context_test', '{"policy":"exclusive"}'::jsonb)`);
  jobs = new JobRunner(appDatabaseUrl(database.url, 'jobs-test-password'));
  await jobs.start();
});
afterAll(async () => { await jobs?.stop(); await pool?.end(); });
it('deduplicates singleton jobs and restores context in a runtime-role worker', async () => {
  const practiceId = '01900000-0000-7000-8000-000000000001' as PracticeId;
  await runWithContext({ practiceId, correlationId: 'jobs-correlation' }, async () => {
    expect(await jobs.enqueue('context_test', { value: 1 }, { singletonKey: 'one' })).toBeTruthy();
    expect(await jobs.enqueue('context_test', { value: 1 }, { singletonKey: 'one' })).toBeNull();
  });
  let resolve: () => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const handled = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  await jobs.register('context_test', async (data) => {
    try {
      expect(data).toEqual({ value: 1 });
      expect(currentContext()).toMatchObject({ practiceId, correlationId: 'jobs-correlation' });
      resolve();
    } catch (error) { reject(error); throw error; }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([handled, new Promise<never>((_resolve, no) => {
      timer = setTimeout(() => no(new Error('Job worker timed out')), 20_000);
    })]);
  } finally { clearTimeout(timer); }
});
