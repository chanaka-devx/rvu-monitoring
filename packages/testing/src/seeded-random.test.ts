import { describe, expect, it } from 'vitest';
import { createRandom } from './seeded-random';

describe('createRandom', () => {
  it('produces identical sequences for the same seed', () => {
    const first = Array.from({ length: 100 }, () => createRandom(1234).next());
    const second = Array.from({ length: 100 }, () => createRandom(1234).next());
    expect(second).toEqual(first);
  });

  it('produces different sequences for different seeds', () => {
    const first = Array.from({ length: 100 }, () => createRandom(1).next());
    const second = Array.from({ length: 100 }, () => createRandom(2).next());
    expect(second).not.toEqual(first);
  });

  it('keeps next() within [0, 1)', () => {
    const random = createRandom(7);
    const values = Array.from({ length: 1_000 }, () => random.next());
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(new Set(values).size).toBeGreaterThan(900);
  });

  it('int returns inclusive integers within [min, max] and covers both endpoints', () => {
    const random = createRandom(99);
    const values = Array.from({ length: 1_000 }, () => random.int(3, 5));
    for (const value of values) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(5);
    }
    expect(new Set(values)).toEqual(new Set([3, 4, 5]));
    expect(random.int(4, 4)).toBe(4);
  });

  it('int is deterministic for the same seed', () => {
    const first = Array.from({ length: 100 }, () => createRandom(11).int(0, 9));
    const second = Array.from({ length: 100 }, () => createRandom(11).int(0, 9));
    expect(second).toEqual(first);
  });

  it('pick returns an element of the array and is deterministic', () => {
    const source = ['a', 'b', 'c'];
    const first = Array.from({ length: 50 }, () => createRandom(33).pick(source));
    const second = Array.from({ length: 50 }, () => createRandom(33).pick(source));
    expect(second).toEqual(first);
    for (const value of first) {
      expect(source).toContain(value);
    }
    const combinedRandom = createRandom(33);
    const picked = new Set(Array.from({ length: 50 }, () => combinedRandom.pick(source)));
    expect(picked.size).toBe(3);
  });

  it('chance is deterministic, always false at 0 and always true at 1', () => {
    const atZero = Array.from({ length: 100 }, () => createRandom(5).chance(0));
    expect(atZero.every((value) => value === false)).toBe(true);
    const atOne = Array.from({ length: 100 }, () => createRandom(5).chance(1));
    expect(atOne.every((value) => value === true)).toBe(true);
    const firstHalf = Array.from({ length: 200 }, () => createRandom(8).chance(0.5));
    const secondHalf = Array.from({ length: 200 }, () => createRandom(8).chance(0.5));
    expect(secondHalf).toEqual(firstHalf);
  });
});
