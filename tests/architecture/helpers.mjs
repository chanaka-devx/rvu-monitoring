import { spawnSync } from 'node:child_process';
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

export function violationRuleNames(report) {
  return (report.summary?.violations ?? []).map((violation) => violation.rule?.name);
}
