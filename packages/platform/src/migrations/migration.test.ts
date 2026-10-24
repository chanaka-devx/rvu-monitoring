import { describe, expect, it } from 'vitest';
import { migrationChecksum, migrationKey, parseMigrationFileName } from './migration';

describe('parseMigrationFileName', () => {
  it('parses NNNN_snake_name.sql', () => {
    const parsed = parseMigrationFileName('0001_install_platform.sql');
    expect(parsed).toEqual({ version: 1, name: 'install_platform' });
  });

  it('rejects malformed names', () => {
    expect(parseMigrationFileName('12_short.sql')).toBeNull();
    expect(parseMigrationFileName('0001_Upper_Name.sql')).toBeNull();
    expect(parseMigrationFileName('0001_dashes-here.sql')).toBeNull();
    expect(parseMigrationFileName('nope.txt')).toBeNull();
  });
});

describe('migrationChecksum', () => {
  it('normalizes CRLF to LF before hashing', () => {
    expect(migrationChecksum('a\r\nb\r\n')).toBe(migrationChecksum('a\nb\n'));
  });

  it('differs for different content', () => {
    expect(migrationChecksum('a')).not.toBe(migrationChecksum('b'));
  });
});

describe('migrationKey', () => {
  it('combines owner and version', () => {
    expect(migrationKey({ owner: 'platform', version: 2 })).toBe('platform/2');
  });
});
