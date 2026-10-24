// Generate once when intentionally upgrading pg-boss, then review/commit the SQL.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'packages', 'platform', 'package.json'));
const { getConstructionPlans } = await import(pathToFileURL(require.resolve('pg-boss')).href);
const target = path.join(root, 'packages', 'platform', 'migrations', '0004_job_schema.sql');
writeFileSync(target, '-- Generated from pg-boss 12.38.0 getConstructionPlans; owner runs this migration.\n' +
  getConstructionPlans('pgboss').replace(/^\s*BEGIN;/, '').replace(/COMMIT;\s*$/, '') + '\nGRANT USAGE ON SCHEMA pgboss TO rvu_app;\n' +
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO rvu_app;\n' +
  'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO rvu_app;\n' +
  'ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rvu_app;\n' +
  'ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT USAGE, SELECT ON SEQUENCES TO rvu_app;\n', { encoding: 'utf8', flag: 'wx' });
