import { describe, expect, it } from 'vitest';
import {
  buildTestDatabaseName,
  buildTestDatabaseUrl,
  isSafeIdentifier
} from './test-database';

describe('test database naming', () => {
  it('generates rvu_test_<hex> names that are safe identifiers', () => {
    for (let index = 0; index < 20; index += 1) {
      const name = buildTestDatabaseName();
      expect(name).toSatisfy(isSafeIdentifier);
      expect(name).toMatch(/^rvu_test_[0-9a-f]{16}$/);
    }
  });

  it('generates distinct names across calls', () => {
    const names = new Set([...Array(10)].map(() => buildTestDatabaseName()));
    expect(names.size).toBe(10);
  });
});

describe('isSafeIdentifier', () => {
  it('accepts lowercase, digits and underscores after the first letter', () => {
    expect(isSafeIdentifier('rvu_test_0ea1')).toBe(true);
    expect(isSafeIdentifier('a')).toBe(true);
    expect(isSafeIdentifier('a_0')).toBe(true);
  });

  it('rejects injected or uppercase or leading digits', () => {
    expect(isSafeIdentifier('A')).toBe(false);
    expect(isSafeIdentifier('0rvu')).toBe(false);
    expect(isSafeIdentifier('rvu-test')).toBe(false);
    expect(isSafeIdentifier('rvu_test"-drop')).toBe(false);
    expect(isSafeIdentifier('rvu$')).toBe(false);
  });

  it('rejects identifiers longer than 63 bytes', () => {
    expect(isSafeIdentifier('a'.repeat(64))).toBe(false);
    expect(isSafeIdentifier('a'.repeat(63))).toBe(true);
  });
});

describe('buildTestDatabaseUrl', () => {
  it('swaps the database in the admin URL, keeping host and credentials', () => {
    const url = buildTestDatabaseUrl(
      'postgres://postgres:secret@localhost:5432/postgres',
      'rvu_test_0ea1f9'
    );
    expect(url).toBe('postgres://postgres:secret@localhost:5432/rvu_test_0ea1f9');
  });

  it('rejects unsafe database names', () => {
    expect(() => buildTestDatabaseUrl('postgres://postgres@localhost/db', 'bad name')).toThrow(
      /unsafe/i
    );
  });
});
