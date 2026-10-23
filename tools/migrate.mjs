import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const entry = path.join(repoRoot, 'packages', 'platform', 'src', 'migrate.ts');

function readEnvFile() {
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const { parseEnv } = process.getBuiltinModule('node:util');
  return parseEnv(fs.readFileSync(envPath, 'utf8'));
}

const env = {
  ...readEnvFile(),
  ...process.env
};

if (!env.DATABASE_URL && env.POSTGRES_DB) {
  const port = env.DB_PORT ?? '5432';
  const user = env.POSTGRES_USER ?? 'rvu';
  const password = encodeURIComponent(env.POSTGRES_PASSWORD ?? 'rvu');
  const database = env.POSTGRES_DB;
  const url = `postgres://${user}:${password}@localhost:${port}/${database}`;
  env.DATABASE_URL = url;
  if (!env.APP_DATABASE_URL) {
    env.APP_DATABASE_URL = url;
  }
}

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', entry],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env
  }
);

process.exitCode = result.status ?? 1;
