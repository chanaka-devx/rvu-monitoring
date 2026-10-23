import { describe, expect, it } from 'vitest';
import { FixedClock } from './fixed-clock';

describe('FixedClock', () => {
  it('returns the date set with set()', () => {
    const clock = new FixedClock();
    const date = new Date('2026-01-15T10:30:00.000Z');
    clock.set(date);
    expect(clock.now().toISOString()).toBe('2026-01-15T10:30:00.000Z');
  });

  it('returns a new Date instance on each now() call', () => {
    const clock = new FixedClock();
    clock.set(new Date('2026-01-15T10:30:00.000Z'));
    const first = clock.now();
    const second = clock.now();
    expect(second).not.toBe(first);
    expect(second.getTime()).toBe(first.getTime());
    clock.advance(1);
    expect(first.getTime()).toBe(new Date('2026-01-15T10:30:00.000Z').getTime());
  });

  it('advance moves the frozen time forward by the given milliseconds', () => {
    const clock = new FixedClock();
    clock.set(new Date('2026-01-15T10:30:00.000Z'));
    clock.advance(1_500);
    expect(clock.now().toISOString()).toBe('2026-01-15T10:30:01.500Z');
    clock.advance(0);
    expect(clock.now().toISOString()).toBe('2026-01-15T10:30:01.500Z');
  });

  it('set overwrites any previously advanced time', () => {
    const clock = new FixedClock();
    clock.set(new Date('2026-01-15T10:30:00.000Z'));
    clock.advance(5_000);
    clock.set(new Date('2020-06-01T00:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2020-06-01T00:00:00.000Z');
  });
});
