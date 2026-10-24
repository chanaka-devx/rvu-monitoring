import fs from 'node:fs';
import path from 'node:path';
import {
  migrationChecksum,
  migrationKey,
  parseMigrationFileName,
  type MigrationSource
} from './migration';

export class MigrationDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationDiscoveryError';
  }
}

export function discoverMigrationSources(repoRoot: string): MigrationSource[] {
  const perOwner: Map<string, MigrationSource[]> = new Map();

  function scanDirectory(owner: string, directory: string): void {
    if (!fs.existsSync(directory)) {
      return;
    }

    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() || !entry.name.endsWith('.sql')) {
        continue;
      }

      const parsed = parseMigrationFileName(entry.name);

      if (!parsed) {
        throw new MigrationDiscoveryError(
          `Invalid migration file name "${path.join(owner, entry.name)}" (expected NNNN_snake_name.sql)`
        );
      }

      const sql = fs.readFileSync(path.join(directory, entry.name), 'utf8');
      perOwner.set(owner, (perOwner.get(owner) ?? []).concat({
        owner,
        version: parsed.version,
        name: parsed.name,
        sql,
        checksum: migrationChecksum(sql)
      }));
    }
  }

  scanDirectory(
    'platform',
    path.join(repoRoot, 'packages', 'platform', 'migrations')
  );

  const modulesRoot = path.join(repoRoot, 'modules');

  if (fs.existsSync(modulesRoot)) {
    for (const entry of fs.readdirSync(modulesRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        scanDirectory(entry.name, path.join(modulesRoot, entry.name, 'infrastructure', 'migrations'));
      }
    }
  }

  const sources: MigrationSource[] = [];

  for (const owner of [...perOwner.keys()].sort()) {
    const sorted = [...(perOwner.get(owner) ?? [])].sort((a, b) => a.version - b.version);

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];

      if (previous && current && previous.version === current.version) {
        throw new MigrationDiscoveryError(
          `Duplicate migration version for owner "${owner}": ${migrationKey(current)}`
        );
      }
    }

    let expected = 1;

    for (const source of sorted) {
      if (source.version !== expected) {
        throw new MigrationDiscoveryError(
          `Gap in migrations for owner "${owner}": expected ${expected}, found ${source.version}`
        );
      }
      expected += 1;
    }

    sources.push(...sorted);
  }

  return sources;
}
