import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preflight } from './test-int-preflight.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['apps', 'packages', 'modules'];
const ignoredDirectories = new Set(['node_modules', 'dist', 'coverage', '.turbo']);

function findIntegrationTests(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const found = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...findIntegrationTests(entryPath));
    } else if (entry.name.endsWith('.int.test.ts')) {
      found.push(entryPath);
    }
  }

  return found;
}

async function run() {
  const integrationTests = roots.flatMap((root) =>
    findIntegrationTests(path.join(repoRoot, root))
  );

  if (integrationTests.length === 0) {
    console.log('No integration tests found; skipping test:int.');
    process.exit(0);
  }

  const decision = await preflight();

  if (!decision.ok) {
    console.error(`test:int: ${decision.message}`);
    process.exit(1);
  }

  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      '--config',
      path.join(repoRoot, 'vitest.int.config.ts')
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env
    }
  );

  process.exit(result.status ?? 1);
}

await run();
