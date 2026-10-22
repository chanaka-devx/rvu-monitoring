import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(repoRoot, '.dependency-cruiser.cjs');
const depcruiseBin = path.join(
  repoRoot,
  'node_modules',
  'dependency-cruiser',
  'bin',
  'dependency-cruiser.mjs'
);

const targets = ['apps', 'packages', 'modules'].filter((target) =>
  fs.existsSync(path.join(repoRoot, target))
);

if (targets.length === 0) {
  console.error('arch: no source folders found (apps, packages, modules).');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [depcruiseBin, '--config', configPath, '--output-type', 'err', ...targets],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NO_COLOR: '1'
    }
  }
);

process.exit(result.status ?? 1);
