import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverMigrationSources } from './discovery';

function makeRepo(owners: Record<string, string[]>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rvu-migrations-'));

  for (const ownerOrDefaultName of Object.keys(owners)) {
    const directory =
      ownerOrDefaultName === 'platform'
        ? path.join(root, 'packages', 'platform', 'migrations')
        : path.join(root, 'modules', ownerOrDefaultName, 'infrastructure', 'migrations');

    fs.mkdirSync(directory, { recursive: true });

    for (const fileName of owners[ownerOrDefaultName] ?? []) {
      fs.writeFileSync(path.join(directory, fileName), `-- ${fileName}\nSELECT 1;\n`, 'utf8');
    }
  }

  return root;
}

describe('discoverMigrationSources', () => {
  it('finds platform and module migrations sorted by owner then version', () => {
    const root = makeRepo({
      platform: ['0002_second.sql', '0001_first.sql'],
      crediting: ['0001_schema.sql']
    });

    expect(
      discoverMigrationSources(root).map((source) => migrationRepresentation(source))
    ).toEqual(['crediting/1:schema', 'platform/1:first', 'platform/2:second']);
  });

  it('rejects duplicate versions per owner', () => {
    const root = makeRepo({ platform: ['0001_a.sql', '0001_b.sql'] });
    expect(() => discoverMigrationSources(root)).toThrowError(/Duplicate migration version for owner "platform"/);
  });

  it('rejects gaps per owner', () => {
    const root = makeRepo({ platform: ['0001_a.sql', '0003_c.sql'] });
    expect(() => discoverMigrationSources(root)).toThrowError(/Gap in migrations for owner "platform"/);
  });

  it('rejects invalid file names', () => {
    const root = makeRepo({ platform: ['0001_A_B.sql'] });
    expect(() => discoverMigrationSources(root)).toThrowError(/Invalid migration file name/);
  });
});

function migrationRepresentation(source: { owner: string; version: number; name: string }): string {
  return `${source.owner}/${source.version}:${source.name}`;
}
