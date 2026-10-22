import { describe, expect, it } from 'vitest';
import type { Uuid } from './brand';
import { IdGenerator, UuidV7Generator } from './id-generator';
import { isUuid } from './brand';

describe('UuidV7Generator', () => {
  it('is an IdGenerator producing valid uuids', () => {
    const generator: IdGenerator = new UuidV7Generator();
    const id = generator.next();
    expect(isUuid(id)).toBe(true);
  });

  it('produces uuid v7 version bits', () => {
    const generator = new UuidV7Generator();
    const id = generator.next();
    expect(id.charAt(14)).toBe('7');
    expect(id.charAt(19)).toMatch(/[89ab]/);
  });

  it('produces distinct ids', () => {
    const generator = new UuidV7Generator();
    const seen = new Set<Uuid>();
    for (let i = 0; i < 1000; i += 1) {
      seen.add(generator.next());
    }
    expect(seen.size).toBe(1000);
  });

  it('sorts monotonically for ids created in sequence', () => {
    const generator = new UuidV7Generator();
    const first = generator.next();
    const second = generator.next();
    expect(first < second).toBe(true);
  });
});
