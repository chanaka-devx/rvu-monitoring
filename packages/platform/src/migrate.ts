import process from 'node:process';
import {
  createPool,
  discoverMigrationSources,
  loadPlatformConfig,
  redactUrl,
  runMigrations
} from './index';

async function main(): Promise<number> {
  const config = loadPlatformConfig(process.env as Record<string, string | undefined>);
  const repoRoot = process.env.RVU_REPO_ROOT ?? process.cwd();

  const pool = createPool(config.databaseUrl, {
    max: 2,
    applicationName: 'rvu-migrate',
    statementTimeoutMs: 0
  });

  try {
    const sources = discoverMigrationSources(repoRoot);
    const applied = await runMigrations({ pool, sources });

    if (applied.length === 0) {
      console.log('Database is up to date.');
    } else {
      for (const migration of applied) {
        console.log(`Applied ${migration.owner}/${migration.version} (${migration.name})`);
      }
    }

    console.log(`Target: ${redactUrl(config.databaseUrl)}`);
    return 0;
  } catch (error) {
    console.error(
      `Migration failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  } finally {
    await pool.end();
  }
}

void (async () => {
  process.exitCode = await main();
})();
