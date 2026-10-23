import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, '../..');
export const fixturesRoot = path.join(here, 'fixtures');

const depcruiseBin = path.join(
  repoRoot,
  'node_modules',
  'dependency-cruiser',
  'bin',
  'dependency-cruiser.mjs'
);

export function runDepcruise(
  cwd,
  { configPath = path.join(repoRoot, '.dependency-cruiser.cjs'), outputType = 'json' } = {}
) {
  const result = spawnSync(
    process.execPath,
    [depcruiseBin, '--config', configPath, '--output-type', outputType, '.'],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        NO_COLOR: '1'
      }
    }
  );

  if (outputType !== 'json') {
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `dependency-cruiser did not return JSON.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return {
    status: result.status,
    report,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

export function runDepcruiseWithLinkedPackages(fixtureName, links) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rvu-architecture-'));

  try {
    fs.cpSync(path.join(fixturesRoot, fixtureName), tempRoot, { recursive: true });

    for (const [packageName, target] of Object.entries(links)) {
      const linkPath = path.join(tempRoot, 'node_modules', ...packageName.split('/'));
      fs.mkdirSync(path.dirname(linkPath), { recursive: true });
      fs.symlinkSync(
        path.join(tempRoot, target),
        linkPath,
        process.platform === 'win32' ? 'junction' : 'dir'
      );
    }

    return runDepcruise(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const PnpmStoreLayout = path.join(
  'node_modules',
  '.pnpm-stub',
  '@stub',
  'node_modules'
);

export function runDepcruiseWithResolvedExternals(fixtureName, externals) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rvu-architecture-'));

  try {
    fs.cpSync(path.join(fixturesRoot, fixtureName), tempRoot, { recursive: true });

    for (const [packageName, stubDir] of Object.entries(externals)) {
      const stubSource = path.join(fixturesRoot, fixtureName, stubDir);
      const installedPath = path.join(tempRoot, PnpmStoreLayout, ...packageName.split('/'));
      const linkPath = path.join(tempRoot, 'node_modules', ...packageName.split('/'));

      fs.cpSync(stubSource, installedPath, { recursive: true });
      fs.mkdirSync(path.dirname(linkPath), { recursive: true });
      fs.symlinkSync(
        installedPath,
        linkPath,
        process.platform === 'win32' ? 'junction' : 'dir'
      );
    }

    return runDepcruise(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function violationRuleNames(report) {
  return (report.summary?.violations ?? []).map((violation) => violation.rule?.name);
}

export function violationFromPaths(report, ruleName) {
  return (report.summary?.violations ?? [])
    .filter((violation) => violation.rule?.name === ruleName)
    .map((violation) => violation.from);
}
