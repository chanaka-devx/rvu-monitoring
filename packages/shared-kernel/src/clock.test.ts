import { describe, expect, it } from 'vitest';
import { Clock, SystemClock } from './clock';

describe('SystemClock', () => {
  it('is a Clock that returns the current time', () => {
    const clock: Clock = new SystemClock();
    const now = clock.now();
    expect(now).toBeInstanceOf(Date);
    const before = Date.now();
    const next = clock.now();
    const after = Date.now();
    expect(next.getTime()).toBeGreaterThanOrEqual(before);
    expect(next.getTime()).toBeLessThanOrEqual(after);
  });

  it('can be replaced by any clock implementing the port', () => {
    class StoppedClock implements Clock {
      now(): Date {
        return new Date(0);
      }
    }
    expect(new StoppedClock().now()).toEqual(new Date(0));
  });
});
