import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '@rvu/testing';
import { Pool } from 'pg';
import { migrationChecksum, migrationKey, type MigrationSource } from './migration';
import { runMigrations } from './runner';

function source(owner: string, version: number, sql: string): MigrationSource {
  const key = `${owner}/${version}`;
  return { owner, version, name: key, sql, checksum: migrationChecksum(sql) };
}

async function appliedKeys(connectionString: string): Promise<string[]> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const rows = await pool.query(
      'SELECT owner, version FROM platform.schema_migrations ORDER BY owner, version'
    );
    return rows.rows.map((row) => `${row.owner}/${row.version}`);
  } finally {
    await pool.end();
  }
}

describe('migration runner (integration)', () => {
  const database = useTestDatabase();

  function pool(): Pool {
    return new Pool({ connectionString: database.url, max: 4 });
  }

  it('applies every source to an empty database and records them', async () => {
    const poolInstance = pool();
    const sources = [
      source('inta', 1, 'CREATE SCHEMA IF NOT EXISTS inta; CREATE TABLE inta.t (id int);'),
      source('inta', 2, 'CREATE TABLE inta.t2 (id int);')
    ];

    const applied = await runMigrations({ pool: poolInstance, sources });
    expect(applied.map((entry) => migrationKey(entry))).toEqual(['inta/1', 'inta/2']);

    expect(await appliedKeys(database.url)).toEqual(['inta/1', 'inta/2']);

    const count = await poolInstance.query('SELECT count(*) AS c FROM inta.t');
    expect(count.rows[0] && count.rows[0].c).toBe('0');

    await poolInstance.end();
  });

  it('re-running is a no-op', async () => {
    const poolInstance = pool();
    const sources = [source('intb', 1, 'CREATE SCHEMA IF NOT EXISTS intb;')];

    await runMigrations({ pool: poolInstance, sources });
    const second = await runMigrations({ pool: poolInstance, sources });
    expect(second).toEqual([]);

    await poolInstance.end();
  });

  it('fails when an applied migration was tampered with', async () => {
    const poolInstance = pool();
    await runMigrations({
      pool: poolInstance,
      sources: [source('intc', 1, 'CREATE SCHEMA IF NOT EXISTS intc;')]
    });

    const tampered = [source('intc', 1, 'SELECT 2;')];
    await expect(runMigrations({ pool: poolInstance, sources: tampered })).rejects.toThrowError(
      /checksum mismatch/
    );

    await poolInstance.end();
  });

  it('fails on duplicate versions in the source list', async () => {
    const poolInstance = pool();
    await expect(
      runMigrations({
        pool: poolInstance,
        sources: [
          source('intd', 1, 'SELECT 1;'),
          source('intd', 1, 'SELECT 2;')
        ]
      })
    ).rejects.toThrowError(/Duplicate migration version/);

    await poolInstance.end();
  });

  it('fails on a version gap in the source list', async () => {
    const poolInstance = pool();
    await expect(
      runMigrations({
        pool: poolInstance,
        sources: [
          source('inte', 1, 'SELECT 1;'),
          source('inte', 3, 'SELECT 3;')
        ]
      })
    ).rejects.toThrowError(/Gap/);

    await poolInstance.end();
  });

  it('serializes concurrent runners so each migration applies exactly once', async () => {
    const poolInstance = pool();
    const sources = [source('intf', 1, 'CREATE SCHEMA IF NOT EXISTS intf;')];

    const [first, second] = await Promise.all([
      runMigrations({ pool: poolInstance, sources }),
      runMigrations({ pool: poolInstance, sources })
    ]);

    expect([...first, ...second].filter((entry) => entry.owner === 'intf')).toHaveLength(1);

    await poolInstance.end();
  });
});
