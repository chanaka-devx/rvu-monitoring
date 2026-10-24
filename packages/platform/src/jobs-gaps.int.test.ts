import { afterAll, beforeAll, expect, it } from 'vitest';
import { appDatabaseUrl, useTestDatabase } from '@rvu/testing';
import { JobRunner } from './jobs';
import { createPool } from './pool';
import { ensureAppRole } from './roles';
import { discoverMigrationSources } from './migrations/discovery';
import { runMigrations } from './migrations/runner';

const database = useTestDatabase();
let owner: ReturnType<typeof createPool>;
let jobs: JobRunner;
let stopped = false;
beforeAll(async () => {
  owner = createPool(database.url);
  await ensureAppRole(owner, { password: 'p2f-jobs-password' });
  await runMigrations({ pool: owner, sources: discoverMigrationSources(process.cwd()) });
  await owner.query(`SELECT pgboss.create_queue('gap_shutdown', '{"policy":"exclusive"}'::jsonb)`);
  jobs = new JobRunner(appDatabaseUrl(database.url, 'p2f-jobs-password'));
  await jobs.start();
});
afterAll(async () => { if (jobs && !stopped) await jobs.stop(); await owner?.end(); });

it('deduplicates singleton jobs and completes graceful stop after processing', async () => {
  const id = await jobs.enqueue('gap_shutdown', { value: 1 }, { singletonKey: 'same' });
  expect(id).toEqual(expect.any(String));
  expect(await jobs.enqueue('gap_shutdown', { value: 2 }, { singletonKey: 'same' })).toBeNull();
  let resolve: () => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const handled = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  let calls = 0;
  await jobs.register('gap_shutdown', async (data) => {
    try { expect(data).toEqual({ value: 1 }); calls += 1; resolve(); }
    catch (error) { reject(error); throw error; }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([handled, new Promise<never>((_resolve, no) => {
      timer = setTimeout(() => no(new Error('Job handler timed out')), 20_000);
    })]);
    await expect(jobs.stop()).resolves.toBeUndefined();
    stopped = true;
    expect(calls).toBe(1);
    const rows = await owner.query('SELECT id, state FROM pgboss.job WHERE name = $1', ['gap_shutdown']);
    expect(rows.rows).toEqual([{ id, state: 'completed' }]);
  } finally { clearTimeout(timer); }
});
