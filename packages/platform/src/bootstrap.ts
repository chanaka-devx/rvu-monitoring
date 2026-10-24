import { createPool } from './pool';
import { ensureAppRole } from './roles';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const password = process.env.APP_DB_PASSWORD;
  if (!url || !password) throw new Error('DATABASE_URL and APP_DB_PASSWORD are required');
  const pool = createPool(url);
  try { await ensureAppRole(pool, { password }); }
  finally { await pool.end(); }
}
void main().catch(() => { console.error('Role bootstrap failed; check owner connection and APP_DB_PASSWORD'); process.exitCode = 1; });
