import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { generateModule } from './index.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempRoots = [];

function makeTempRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rvu-module-'));
  tempRoots.push(tempRoot);
  return tempRoot;
}

function collectFiles(directory) {
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }

  return files;
}

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1'
    }
  });
}

afterAll(() => {
  for (const tempRoot of tempRoots) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe('module generator', () => {
  it('generates an LF-only module skeleton that passes lint and architecture rules', () => {
    const tempRoot = makeTempRoot();
    const moduleDir = generateModule('sample', { rootDir: tempRoot });

    for (const relativePath of [
      'README.md',
      'package.json',
      'tsconfig.json',
      'public-api.ts',
      'index.test.ts',
      path.join('domain', 'index.ts'),
      path.join('application', 'index.ts'),
      path.join('infrastructure', 'index.ts'),
      path.join('interface', 'index.ts')
    ]) {
      expect(fs.existsSync(path.join(moduleDir, relativePath)), relativePath).toBe(true);
    }

    for (const file of collectFiles(moduleDir)) {
      expect(fs.readFileSync(file, 'utf8').includes('\r\n'), file).toBe(false);
    }

    const lint = run(
      process.execPath,
      [
        path.join(repoRoot, 'node_modules', 'eslint', 'bin', 'eslint.js'),
        '--config',
        path.join(repoRoot, 'eslint.config.mjs'),
        'modules/sample'
      ],
      tempRoot
    );
    expect(lint.status, `${lint.stdout}\n${lint.stderr}`).toBe(0);

    const arch = run(
      process.execPath,
      [
        path.join(repoRoot, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs'),
        '--config',
        path.join(repoRoot, '.dependency-cruiser.cjs'),
        '--output-type',
        'err',
        '.'
      ],
      tempRoot
    );
    expect(arch.status, `${arch.stdout}\n${arch.stderr}`).toBe(0);

    fs.copyFileSync(
      path.join(repoRoot, 'tsconfig.base.json'),
      path.join(tempRoot, 'tsconfig.base.json')
    );
    fs.writeFileSync(
      path.join(tempRoot, 'vitest.config.mjs'),
      "export default { test: { include: ['modules/**/*.test.ts'] } };\n",
      'utf8'
    );
    fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(tempRoot, 'node_modules'), 'junction');

    const sampleTest = run(
      process.execPath,
      [
        path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'),
        'run',
        '--root',
        tempRoot,
        '--config',
        path.join(tempRoot, 'vitest.config.mjs')
      ],
      tempRoot
    );
    expect(sampleTest.status, `${sampleTest.stdout}\n${sampleTest.stderr}`).toBe(0);
  });

  it('refuses invalid and duplicate module names', () => {
    const tempRoot = makeTempRoot();

    expect(() => generateModule('Not Valid', { rootDir: tempRoot })).toThrow(/kebab-case/);

    generateModule('duplicate', { rootDir: tempRoot });
    expect(() => generateModule('duplicate', { rootDir: tempRoot })).toThrow(/already exists/);
  });
});
