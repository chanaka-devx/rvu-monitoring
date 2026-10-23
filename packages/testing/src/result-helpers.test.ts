import { err, ok } from '@rvu/shared-kernel';
import { describe, expect, it } from 'vitest';
import { expectErr, expectOk } from './result-helpers';

describe('expectOk', () => {
  it('returns the value of an ok result', () => {
    expect(expectOk(ok(42))).toBe(42);
  });

  it('throws with the error for an err result', () => {
    const error = { code: 'x/y', message: 'bad', kind: 'validation' as const };
    const thrown = (() => {
      try {
        expectOk(err(error));
        return null;
      } catch (thrown) {
        return thrown as Error;
      }
    })();
    expect(thrown).not.toBeNull();
    expect(thrown?.message).toContain('x/y');
    expect(thrown?.message).toContain('bad');
  });
});

describe('expectErr', () => {
  it('returns the error of an err result', () => {
    const error = { code: 'x/y', message: 'bad', kind: 'validation' as const };
    expect(expectErr(err(error))).toBe(error);
  });

  it('throws for an ok result', () => {
    expect(() => expectErr(ok(42))).toThrow();
  });
});
