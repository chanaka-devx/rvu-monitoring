import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POSTGRES_IMAGE } from './image';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);

function composePostgresImage(): string {
  const compose = readFileSync(path.join(repoRoot, 'docker-compose.yml'), 'utf8');
  const match = /image:\s*([^\s]+)/.exec(compose);

  if (!match) {
    throw new Error('docker-compose.yml has no image line');
  }

  return match[1] as string;
}

describe('POSTGRES_IMAGE', () => {
  it('matches the image used by docker-compose.yml', () => {
    expect(POSTGRES_IMAGE).toBe(composePostgresImage());
  });

  it('is pinned to Postgres 16', () => {
    expect(POSTGRES_IMAGE).toMatch(/^postgres:16(?:-|$)/);
  });
});
