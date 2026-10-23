import { createHash } from 'node:crypto';

export interface MigrationSource {
  owner: string;
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

const FILE_NAME_PATTERN = /^(\d{4})_[a-z][a-z0-9_]*\.sql$/;

export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

export function migrationKey(source: { owner: string; version: number }): string {
  return `${source.owner}/${source.version}`;
}

export function parseMigrationFileName(
  fileName: string
): { version: number; name: string } | null {
  const match = FILE_NAME_PATTERN.exec(fileName);

  if (!match) {
    return null;
  }

  return {
    version: Number.parseInt(match[1] as string, 10),
    name: fileName.slice(5).replace(/\.sql$/, '')
  };
}
