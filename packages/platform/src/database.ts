import { Kysely, PostgresDialect } from 'kysely';
import type { Pool } from 'pg';

export function createDb<DB>(pool: Pool): Kysely<DB> {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}
