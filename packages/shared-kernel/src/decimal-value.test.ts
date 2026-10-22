import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DecimalValue, type RoundingMode } from './decimal-value';

const parseOk = (value: string): DecimalValue => {
  const result = DecimalValue.parse(value);
  if (!result.ok) {
    throw new Error(`expected '${value}' to parse, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
};

const isErrValidation = { ok: false, error: { kind: 'validation' } };

const decimalString = (maxInteger: number, fractionDigits: number): fc.Arbitrary<string> =>
  fc.record({
    negative: fc.boolean(),
    integer: fc.integer({ min: 0, max: maxInteger }),
    fraction: fc.option(fc.nat(10 ** fractionDigits - 1), { nil: null })
  }).map(({ negative, integer, fraction }) =>
    `${negative ? '-' : ''}${integer}${
      fraction === null ? '' : `.${String(fraction).padStart(fractionDigits, '0')}`
    }`
  );

describe('parse', () => {
  it.each([
    '0',
    '-0.5',
    '1',
    '007',
    '3.14159',
    '-12.34',
    '99999999999999999999999999'
  ])('accepts %s', (value) => {
    expect(DecimalValue.parse(value).ok).toBe(true);
  });

  it.each([
    '',
    '  1',
    '1  ',
    '1.',
    '.5',
    '+1',
    '1e5',
    '1E5',
    'NaN',
    'Infinity',
    '-Infinity',
    '0x10',
    '1,000',
    '1.2.3',
    'abc'
  ])('rejects %s', (value) => {
    const result = DecimalValue.parse(value);
    expect(result).toMatchObject(isErrValidation);
  });

  it('reports the offending input in the error details', () => {
    const result = DecimalValue.parse('1e5');
    if (!result.ok) {
      expect(result.error.code).toBe('decimal/invalid-format');
      expect(result.error.details).toEqual({ input: '1e5' });
    } else {
      expect.unreachable('parse of 1e5 must fail');
    }
  });
});

describe('fromInteger', () => {
  it('accepts safe integers', () => {
    expect(DecimalValue.fromInteger(42).ok).toBe(true);
    expect(DecimalValue.fromInteger(+0).ok).toBe(true);
    expect(DecimalValue.fromInteger(-7).ok).toBe(true);
    expect(DecimalValue.fromInteger(1_000_000_000_000).ok).toBe(true);
    const twoTrillion = DecimalValue.fromInteger(2_000_000_000_000);
    if (twoTrillion.ok) {
      expect(twoTrillion.value.equals(parseOk('2000000000000'))).toBe(true);
    }
  });

  it.each([
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MIN_SAFE_INTEGER - 1
  ])('rejects %p', (value) => {
    expect(DecimalValue.fromInteger(value).ok).toBe(false);
  });
});

describe('zero', () => {
  it('is zero and equals parsed zero', () => {
    expect(DecimalValue.zero().isZero()).toBe(true);
    expect(DecimalValue.zero().equals(parseOk('0'))).toBe(true);
  });
});

describe('arithmetic', () => {
  it('computes 0.1 + 0.2 exactly as 0.3', () => {
    const sum = parseOk('0.1').add(parseOk('0.2'));
    expect(sum.equals(parseOk('0.3'))).toBe(true);
    expect(sum.toFixed(1)).toBe('0.3');
  });

  it('subtracts across the decimal point exactly', () => {
    expect(parseOk('0.3').subtract(parseOk('0.1')).equals(parseOk('0.2'))).toBe(true);
  });

  it('multiplies exactly', () => {
    expect(parseOk('1.10').multiply(parseOk('2')).equals(parseOk('2.2'))).toBe(true);
  });

  it('adds commutatively', () => {
    fc.assert(
      fc.property(
        decimalString(999_999_999_999, 6),
        decimalString(999_999_999_999, 6),
        (aValue, bValue) => {
          const a = parseOk(aValue);
          const b = parseOk(bValue);
          expect(a.add(b).equals(b.add(a))).toBe(true);
        }
      )
    );
  });

  it('adds associatively', () => {
    fc.assert(
      fc.property(
        decimalString(99_999_999, 4),
        decimalString(99_999_999, 4),
        decimalString(99_999_999, 4),
        (aValue, bValue, cValue) => {
          const a = parseOk(aValue);
          const b = parseOk(bValue);
          const c = parseOk(cValue);
          expect(a.add(b.add(c)).equals(a.add(b).add(c))).toBe(true);
        }
      )
    );
  });

  it('satisfies a.add(b).subtract(b).equals(a)', () => {
    fc.assert(
      fc.property(
        decimalString(999_999_999_999, 6),
        decimalString(999_999_999_999, 6),
        (aValue, bValue) => {
          const a = parseOk(aValue);
          const b = parseOk(bValue);
          expect(a.add(b).subtract(b).equals(a)).toBe(true);
        }
      )
    );
  });

  it('satisfies a.subtract(a).isZero()', () => {
    fc.assert(
      fc.property(decimalString(999_999_999_999, 6), (aValue) => {
        const a = parseOk(aValue);
        expect(a.subtract(a).isZero()).toBe(true);
      })
    );
  });

  it('multiplies commutatively', () => {
    fc.assert(
      fc.property(
        decimalString(99_999, 4),
        decimalString(99_999, 4),
        (aValue, bValue) => {
          const a = parseOk(aValue);
          const b = parseOk(bValue);
          expect(a.multiply(b).equals(b.multiply(a))).toBe(true);
        }
      )
    );
  });
});

describe('divide', () => {
  it('returns an error on zero divisor', () => {
    const result = parseOk('5').divide(DecimalValue.zero(), 2);
    expect(result).toMatchObject(isErrValidation);
    if (!result.ok) {
      expect(result.error.code).toBe('decimal/division-by-zero');
    }
  });

  it('divides with the given scale using HALF_UP by default', () => {
    const third = parseOk('1').divide(parseOk('3'), 4);
    if (third.ok) {
      expect(third.value.equals(parseOk('0.3333'))).toBe(true);
      expect(third.value.toFixed(4)).toBe('0.3333');
    } else {
      expect.unreachable('1/3 must divide');
    }
    const twoThirds = parseOk('2').divide(parseOk('3'), 4);
    if (twoThirds.ok) {
      expect(twoThirds.value.toFixed(4)).toBe('0.6667');
    }
  });

  it('rounds ties away from zero by default', () => {
    const quotient = parseOk('2.5').divide(parseOk('2'), 1);
    if (quotient.ok) {
      expect(quotient.value.toFixed(1)).toBe('1.3');
    } else {
      expect.unreachable('2.5/2 must divide');
    }
  });

  it('honors the requested rounding mode', () => {
    const halfEven = parseOk('2.5').divide(parseOk('2'), 1, 'HALF_EVEN');
    if (halfEven.ok) {
      expect(halfEven.value.toFixed(1)).toBe('1.2');
    } else {
      expect.unreachable('2.5/2 must divide');
    }
  });
});

describe('round', () => {
  it('rounds HALF_UP by default', () => {
    expect(parseOk('2.675').round(2).toFixed(2)).toBe('2.68');
    expect(parseOk('2.5').round(0).toFixed(0)).toBe('3');
    expect(parseOk('-2.5').round(0).toFixed(0)).toBe('-3');
  });

  it('supports alternate modes', () => {
    expect(parseOk('2.5').round(0, 'HALF_EVEN').toFixed(0)).toBe('2');
    expect(parseOk('3.5').round(0, 'HALF_EVEN').toFixed(0)).toBe('4');
    expect(parseOk('2.9').round(0, 'DOWN').toFixed(0)).toBe('2');
    expect(parseOk('2.1').round(0, 'UP').toFixed(0)).toBe('3');
    expect(parseOk('2.9').toFixed(0)).toBe('3');
  });
});

describe('comparisons', () => {
  it('compares values numerically', () => {
    expect(parseOk('1').compare(parseOk('2'))).toBe(-1);
    expect(parseOk('2').compare(parseOk('2'))).toBe(0);
    expect(parseOk('2').compare(parseOk('1'))).toBe(1);
    expect(parseOk('-1').compare(parseOk('-2'))).toBe(1);
    expect(parseOk('0.3').compare(parseOk('0.30'))).toBe(0);
  });

  it('treats 0.30 and 0.3 as equal', () => {
    expect(parseOk('0.30').equals(parseOk('0.3'))).toBe(true);
  });

  it('orders with lessThan and greaterThan', () => {
    expect(parseOk('2').lessThan(parseOk('2.0001'))).toBe(true);
    expect(parseOk('2').lessThan(parseOk('2'))).toBe(false);
    expect(parseOk('3').greaterThan(parseOk('2.999'))).toBe(true);
    expect(parseOk('3').greaterThan(parseOk('3'))).toBe(false);
  });

  it('reports zero and sign correctly', () => {
    expect(parseOk('0').isZero()).toBe(true);
    expect(parseOk('0.00').isZero()).toBe(true);
    expect(parseOk('-3').isNegative()).toBe(true);
    expect(parseOk('3').isNegative()).toBe(false);
  });

  it('takes the absolute value', () => {
    expect(parseOk('-5.5').abs().equals(parseOk('5.5'))).toBe(true);
    expect(parseOk('5.5').abs().equals(parseOk('5.5'))).toBe(true);
  });
});

describe('sum/min/max', () => {
  it('sums values', () => {
    const total = DecimalValue.sum([parseOk('1.5'), parseOk('2.25'), parseOk('0.25')]);
    expect(total.equals(parseOk('4'))).toBe(true);
  });

  it('sums an empty list to zero', () => {
    expect(DecimalValue.sum([]).isZero()).toBe(true);
  });

  it('picks min and max among at least two values', () => {
    const low = parseOk('-5');
    const high = parseOk('3');
    expect(DecimalValue.min(low, high).equals(low)).toBe(true);
    expect(DecimalValue.max(low, high).equals(high)).toBe(true);
    expect(DecimalValue.min(high, low).equals(low)).toBe(true);
    expect(DecimalValue.max(high, high, low, parseOk('7')).equals(parseOk('7'))).toBe(true);
  });
});

describe('toFixed and JSON', () => {
  it('formats with an exact scale', () => {
    expect(parseOk('3.14159').toFixed(2)).toBe('3.14');
    expect(parseOk('1').toFixed(3)).toBe('1.000');
    expect(parseOk('-2.345').toFixed(2)).toBe('-2.35');
  });

  it('serializes to a plain numeric string in JSON', () => {
    expect(JSON.stringify(parseOk('3.14159'))).toBe('"3.14159"');
    expect(JSON.stringify(parseOk('-0.5'))).toBe('"-0.5"');
  });

  it('round trips through JSON', () => {
    fc.assert(
      fc.property(decimalString(999_999_999_999, 6), (value) => {
        const original = parseOk(value);
        const revived = parseOk(JSON.parse(JSON.stringify(original)) as string);
        expect(revived.equals(original)).toBe(true);
      })
    );
  });

  it('round trips through toFixed', () => {
    fc.assert(
      fc.property(decimalString(999_999_999_999, 4), (value) => {
        const original = parseOk(value);
        const fixed = original.toFixed(4);
        const reparsed = DecimalValue.parse(fixed);
        expect(reparsed.ok).toBe(true);
        if (reparsed.ok) {
          expect(reparsed.value.equals(original)).toBe(true);
          expect(reparsed.value.toFixed(4)).toBe(fixed);
        }
      })
    );
  });
});

describe('toNumeric', () => {
  it('accepts 99999999.9999 for NUMERIC(12,4)', () => {
    const result = parseOk('99999999.9999').toNumeric(12, 4);
    expect(result).toEqual({ ok: true, value: '99999999.9999' });
  });

  it('rejects 100000000 for NUMERIC(12,4)', () => {
    const result = parseOk('100000000').toNumeric(12, 4);
    expect(result).toMatchObject(isErrValidation);
    if (!result.ok) {
      expect(result.error.code).toBe('decimal/numeric-overflow');
      expect(result.error.details).toEqual({ precision: 12, scale: 4 });
    }
  });

  it('rejects 1.00001 for NUMERIC(12,4)', () => {
    expect(parseOk('1.00001').toNumeric(12, 4).ok).toBe(false);
  });

  it('rejects 0.00001 for a smaller scale', () => {
    expect(parseOk('0.00001').toNumeric(10, 4).ok).toBe(false);
  });

  it('pads the scale without changing the value', () => {
    expect(parseOk('12.5').toNumeric(12, 4)).toEqual({ ok: true, value: '12.5000' });
    expect(parseOk('-99999999.9999').toNumeric(12, 4)).toEqual({ ok: true, value: '-99999999.9999' });
    expect(parseOk('0').toNumeric(4, 2)).toEqual({ ok: true, value: '0.00' });
  });

  it('accepts values fitting tight precision', () => {
    expect(parseOk('99.99').toNumeric(4, 2)).toEqual({ ok: true, value: '99.99' });
    expect(parseOk('1').toNumeric(1, 0)).toEqual({ ok: true, value: '1' });
  });

  it('rejects an integer that fills a tight precision', () => {
    expect(parseOk('100').toNumeric(2, 0).ok).toBe(false);
    expect(parseOk('10').toNumeric(2, 0).ok).toBe(true);
  });
});

describe('percentOf', () => {
  it('computes 368 percentOf 500 with scale 2 as 73.60', () => {
    const result = parseOk('368').percentOf(parseOk('500'), 2);
    if (result.ok) {
      expect(result.value.equals(parseOk('73.6'))).toBe(true);
      expect(result.value.toFixed(2)).toBe('73.60');
    } else {
      expect.unreachable('368 of 500 must compute');
    }
  });

  it('returns an error for a zero total', () => {
    const result = parseOk('5').percentOf(DecimalValue.zero(), 2);
    expect(result).toMatchObject(isErrValidation);
    if (!result.ok) {
      expect(result.error.code).toBe('decimal/division-by-zero');
    }
  });

  it('yields 100 percent for equal parts', () => {
    const result = parseOk('368').percentOf(parseOk('368'), 4);
    if (result.ok) {
      expect(result.value.equals(parseOk('100'))).toBe(true);
    } else {
      expect.unreachable('368 of 368 must compute');
    }
  });
});

describe('no float escape hatches', () => {
  it('exposes no toNumber and no float constructor', () => {
    expect(Object.getOwnPropertyNames(DecimalValue.prototype)).not.toContain('toNumber');
    expect(Object.getOwnPropertyNames(DecimalValue)).not.toContain('fromNumber');
  });
});

describe('rounding mode coverage', () => {
  it('maps all supported names', () => {
    const modes: RoundingMode[] = [
      'UP',
      'DOWN',
      'CEIL',
      'FLOOR',
      'HALF_UP',
      'HALF_DOWN',
      'HALF_EVEN',
      'HALF_CEIL',
      'HALF_FLOOR'
    ];
    const twoPointFive = parseOk('2.5');
    const distinct = new Set(
      modes.map((mode) => {
        const rounded = twoPointFive.round(0, mode);
        expect(rounded.toFixed(0)).toMatch(/^[23]$/);
        return rounded.toFixed(0);
      })
    );
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });
});
