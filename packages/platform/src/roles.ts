import type { Pool } from 'pg';

export async function ensureAppRole(pool: Pool, options: { name?: string; password: string }): Promise<void> {
  const name = options.name ?? 'rvu_app';
  if (!/^[a-z][a-z0-9_]*$/.test(name) || name.length > 63) throw new Error('Invalid role name');
  if (!options.password || options.password.includes('\0')) throw new Error('Invalid role password');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(70011002)');
    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [name]);
    const password = options.password.replaceAll("'", "''");
    await client.query(`${exists.rowCount ? 'ALTER' : 'CREATE'} ROLE "${name}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
