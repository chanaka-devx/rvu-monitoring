import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, '.env');
const env = { ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}), ...process.env };
if (!env.DATABASE_URL) {
  const url = new URL(`postgres://localhost:${env.DB_PORT ?? '5432'}/${env.POSTGRES_DB ?? 'rvu_monitoring'}`);
  url.username = env.POSTGRES_USER ?? 'rvu';
  url.password = env.POSTGRES_PASSWORD ?? 'rvu';
  env.DATABASE_URL = url.toString();
}
const result = spawnSync(process.execPath, ['--import', 'tsx', path.join(root, 'packages', 'platform', 'src', 'bootstrap.ts')], { cwd: root, env, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
