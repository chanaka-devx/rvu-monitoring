import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const IDENTIFIER_MAX_LENGTH = 63;

export interface TestDatabase {
  name: string;
  url: string;
  drop(): Promise<void>;
}

export function isSafeIdentifier(value: string): boolean {
  return value.length <= IDENTIFIER_MAX_LENGTH && IDENTIFIER_PATTERN.test(value);
}

export function buildTestDatabaseName(): string {
  const name = `rvu_test_${randomBytes(8).toString('hex')}`;
  return name;
}

export function buildTestDatabaseUrl(adminUrl: string, name: string): string {
  assertSafeIdentifier(name);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function assertSafeIdentifier(name: string): void {
  if (!isSafeIdentifier(name)) {
    throw new Error(`Unsafe database identifier: ${JSON.stringify(name)}`);
  }
}

export async function createTestDatabase(adminUrl: string): Promise<TestDatabase> {
  const pool = new Pool({ connectionString: adminUrl, max: 2 });
  const name = buildTestDatabaseName();
  const url = buildTestDatabaseUrl(adminUrl, name);
  let dropped = false;

  try {
    await pool.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  } catch (error) {
    await pool.end();
    throw error;
  }

  return {
    name,
    url,
    drop: async () => {
      if (dropped) {
        return;
      }
      dropped = true;
      try {
        await drop(pool, name);
      } finally {
        await pool.end();
      }
    }
  };
}

async function drop(pool: Pool, name: string): Promise<void> {
  assertSafeIdentifier(name);

  await pool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [name]
  );
  await pool.query(`DROP DATABASE IF EXISTS "${name}"`);
}
