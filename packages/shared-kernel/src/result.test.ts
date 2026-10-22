import { describe, expect, it } from 'vitest';
import { andThen, combine, err, isErr, isOk, map, mapErr, match, ok, type Result } from './result';

const divideIfPositive = (n: number) => (n > 0 ? ok(n / 2) : err('non-positive'));

describe('result constructors', () => {
  it('ok wraps a value', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
  });

  it('err wraps an error', () => {
    expect(err('bad')).toEqual({ ok: false, error: 'bad' });
  });
});

describe('isOk/isErr', () => {
  it('narrow the union', () => {
    const good: Result<number, string> = ok(1);
    const bad: Result<number, string> = err('bad');
    if (isOk(good)) {
      expect(good.value).toBe(1);
    } else {
      expect.unreachable('ok must narrow');
    }
    if (isErr(bad)) {
      expect(bad.error).toBe('bad');
    } else {
      expect.unreachable('err must narrow');
    }
  });
});

describe('map', () => {
  it('transforms the value of ok', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
  });

  it('maps err through untouched', () => {
    expect(map(err<number, string>('bad'), (n) => n * 3)).toEqual({ ok: false, error: 'bad' });
  });

  it('does not call the mapper on err', () => {
    let called = false;
    map(err<number, string>('bad'), () => {
      called = true;
      return 9;
    });
    expect(called).toBe(false);
  });
});

describe('mapErr', () => {
  it('transforms the error of err', () => {
    expect(mapErr(err('bad'), (e) => `${e}!`)).toEqual({ ok: false, error: 'bad!' });
  });

  it('maps ok through untouched', () => {
    expect(mapErr(ok(2), (e) => `${e}!`)).toEqual({ ok: true, value: 2 });
  });

  it('does not call the mapper on ok', () => {
    let called = false;
    mapErr(ok(2), () => {
      called = true;
      return 9;
    });
    expect(called).toBe(false);
  });
});

describe('andThen', () => {
  it('chains on ok', () => {
    expect(andThen(ok(4), divideIfPositive)).toEqual({ ok: true, value: 2 });
  });

  it('propagates the chained error', () => {
    expect(andThen(ok(-4), divideIfPositive)).toEqual({ ok: false, error: 'non-positive' });
  });

  it('short-circuits on the original err without calling the function', () => {
    let called = false;
    const chained = andThen(err<number, string>('bad'), (n) => {
      called = true;
      return divideIfPositive(n);
    });
    expect(chained).toEqual({ ok: false, error: 'bad' });
    expect(called).toBe(false);
  });
});

describe('match', () => {
  it('returns the ok branch', () => {
    expect(match(ok<number, string>(3), (v) => `got ${v}`, (e) => `err ${e}`)).toBe('got 3');
  });

  it('returns the err branch', () => {
    expect(match(err<number, string>('bad'), (v) => `got ${v}`, (e) => `err ${e}`)).toBe('err bad');
  });
});

describe('combine', () => {
  it('returns all values when every result is ok', () => {
    expect(combine([ok(1), ok(2), ok(3)])).toEqual({ ok: true, value: [1, 2, 3] });
  });

  it('returns the first error', () => {
    expect(combine([ok(1), err<number, string>('first'), ok(3), err<number, string>('second')]))
      .toEqual({ ok: false, error: 'first' });
  });

  it('returns ok of an empty list', () => {
    expect(combine([])).toEqual({ ok: true, value: [] });
  });
});
