import {
  migrationKey,
  type MigrationSource
} from './migration';

export const MIGRATION_LOCK_KEY = 7001_1001;

export interface AppliedMigration {
  owner: string;
  version: number;
  name: string;
}

export class MigrationRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationRunError';
  }
}

function assertNoGaps(sources: readonly MigrationSource[]): void {
  const seenVersionsByOwner: Map<string, Set<number>> = new Map();
  const sortedByOwner: Map<string, number[]> = new Map();

  for (const source of sources) {
    const seen = seenVersionsByOwner.get(source.owner) ?? new Set<number>();

    if (seen.has(source.version)) {
      throw new MigrationRunError(`Duplicate migration version ${migrationKey(source)} in the source list`);
    }

    seen.add(source.version);
    seenVersionsByOwner.set(source.owner, seen);
    sortedByOwner.set(source.owner, (sortedByOwner.get(source.owner) ?? []).concat(source.version));
  }

  for (const owner of [...sortedByOwner.keys()].sort()) {
    const sorted = [...(sortedByOwner.get(owner) ?? [])].sort((a, b) => a - b);
    let expected = 1;

    for (const version of sorted) {
      if (version !== expected) {
        throw new MigrationRunError(
          `Gap in migrations for owner "${owner}": expected ${expected}, found ${version}`
        );
      }
      expected += 1;
    }
  }
}

export async function runMigrations({
  pool,
  sources
}: {
  pool: import('pg').Pool;
  sources: readonly MigrationSource[];
}): Promise<AppliedMigration[]> {
  assertNoGaps(sources);

  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query('CREATE SCHEMA IF NOT EXISTS platform');
    await client.query(
      `CREATE TABLE IF NOT EXISTS platform.schema_migrations (
        owner text NOT NULL,
        version integer NOT NULL,
        name text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (owner, version)
      )`
    );

    const applied = await client.query(
      'SELECT owner, version, name, checksum FROM platform.schema_migrations'
    );
    const appliedKeys: Set<string> = new Set();

    for (const row of applied.rows) {
      const key = `${row.owner}/${row.version}`;
      appliedKeys.add(key);

      const source = sources.find((entry) => migrationKey(entry) === key);

      if (source && source.checksum !== row.checksum) {
        throw new MigrationRunError(
          `Migration ${key} (${row.name}) changed since it was applied (checksum mismatch). ` +
            'Forward-only: revert the file or fix it out-of-band.'
        );
      }
    }

    const appliedMigrations: AppliedMigration[] = [];

    for (const source of sources) {
      const key = migrationKey(source);

      if (appliedKeys.has(key)) {
        continue;
      }

      try {
        await client.query('BEGIN');
        await client.query(source.sql);
        await client.query(
          'INSERT INTO platform.schema_migrations (owner, version, name, checksum) VALUES ($1, $2, $3, $4)',
          [source.owner, source.version, source.name, source.checksum]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        const message = error instanceof Error ? error.message : String(error);
        throw new MigrationRunError(`Migration ${key} (${source.name}) failed: ${message}`);
      }

      appliedMigrations.push({
        owner: source.owner,
        version: source.version,
        name: source.name
      });
    }

    return appliedMigrations;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}
