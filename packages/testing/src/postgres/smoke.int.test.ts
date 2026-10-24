import { describe, expect, it, inject } from 'vitest';
import { Client } from 'pg';
import {
  createTestDatabase,
  isSafeIdentifier,
  useTestDatabase
} from '../index';

describe('integration smoke (postgres via testcontainers)', () => {
  it('runs select 1 on a fresh test database', async () => {
    const database = await createTestDatabase(inject('postgresAdminUrl'));

    const client = new Client({ connectionString: database.url });
    await client.connect();
    try {
      const result = await client.query('SELECT 1 AS one');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0] && result.rows[0].one).toBe(1);
    } finally {
      await client.end();
      await database.drop();
    }
  });

  it('talks to a postgres 16 server', async () => {
    const database = await createTestDatabase(inject('postgresAdminUrl'));

    const client = new Client({ connectionString: database.url });
    await client.connect();
    try {
      const result = await client.query('SHOW server_version_num');
      const version = result.rows[0] && result.rows[0].server_version_num;
      expect(String(version)).toMatch(/^16\d{4,6}$/);
    } finally {
      await client.end();
      await database.drop();
    }
  });

  it('isolates two test databases from each other', async () => {
    const first = await createTestDatabase(inject('postgresAdminUrl'));
    const second = await createTestDatabase(inject('postgresAdminUrl'));

    expect(first.name).not.toBe(second.name);

    const firstClient = new Client({ connectionString: first.url });
    const secondClient = new Client({ connectionString: second.url });
    await firstClient.connect();
    await secondClient.connect();

    try {
      await firstClient.query('CREATE TABLE rvu_probe (id int)');
      const visibleInFirst = await firstClient.query(
        "SELECT to_regclass('public.rvu_probe') AS reg"
      );
      const visibleInSecond = await secondClient.query(
        "SELECT to_regclass('public.rvu_probe') AS reg"
      );

      expect(visibleInFirst.rows[0] && visibleInFirst.rows[0].reg).toContain('rvu_probe');
      expect(visibleInSecond.rows[0] && visibleInSecond.rows[0].reg).toBeNull();
    } finally {
      await firstClient.end();
      await secondClient.end();
      await first.drop();
      await second.drop();
    }
  });

  it('drops the database and a second drop call does not throw', async () => {
    const database = await createTestDatabase(inject('postgresAdminUrl'));

    const admin = new Client({ connectionString: inject('postgresAdminUrl') });
    await admin.connect();
    try {
      await database.drop();
      const gone = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
        database.name
      ]);
      expect(gone.rows).toHaveLength(0);

      await expect(database.drop()).resolves.toBeUndefined();
    } finally {
      await admin.end();
    }
  });

  describe('useTestDatabase helper suite lifecycle', () => {
    const database = useTestDatabase();

    it('provides a per-file test database url', async () => {
      expect(isSafeIdentifier(database.url.split('/').pop() as string)).toBe(true);

      const client = new Client({ connectionString: database.url });
      await client.connect();
      try {
        const result = await client.query('SELECT current_database() AS name');
        const name = String(result.rows[0] && result.rows[0].name);
        expect(name).toMatch(/^rvu_test_[0-9a-f]{16}$/);
      } finally {
        await client.end();
      }
    });
  });
});
