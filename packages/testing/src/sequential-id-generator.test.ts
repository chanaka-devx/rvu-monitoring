import { isUuid } from '@rvu/shared-kernel';
import { describe, expect, it } from 'vitest';
import { SequentialIdGenerator } from './sequential-id-generator';

describe('SequentialIdGenerator', () => {
  it('produces unique ids', () => {
    const generator = new SequentialIdGenerator();
    const ids = Array.from({ length: 1_000 }, () => generator.next());
    expect(new Set(ids).size).toBe(1_000);
  });

  it('produces ids that pass the kernel isUuid check', () => {
    const generator = new SequentialIdGenerator();
    const ids = Array.from({ length: 1_000 }, () => generator.next());
    for (const id of ids) {
      expect(isUuid(id)).toBe(true);
    }
  });

  it('produces the same sequence across two fresh instances', () => {
    const first = Array.from({ length: 100 }, () => new SequentialIdGenerator().next());
    const second = Array.from({ length: 100 }, () => new SequentialIdGenerator().next());
    expect(second).toEqual(first);
  });

  it('honors an optional start value', () => {
    const baseline = new SequentialIdGenerator();
    const ids = Array.from({ length: 6 }, () => baseline.next());
    const startedAt = new SequentialIdGenerator(5);
    expect(startedAt.next()).toBe(ids[5]);
  });

  it('never equals an id of a smaller start value from a fresh generator at the same call index', () => {
    const low = new SequentialIdGenerator(0).next();
    const high = new SequentialIdGenerator(1).next();
    expect(high).not.toBe(low);
  });
});
