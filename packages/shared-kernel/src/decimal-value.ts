import { Decimal } from 'decimal.js';
import { validationError, type DomainError } from './errors';
import { err, ok, type Result } from './result';

const DecimalConfig = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

type ConfiguredDecimal = InstanceType<typeof DecimalConfig>;

export type RoundingMode =
  | 'UP'
  | 'DOWN'
  | 'CEIL'
  | 'FLOOR'
  | 'HALF_UP'
  | 'HALF_DOWN'
  | 'HALF_EVEN'
  | 'HALF_CEIL'
  | 'HALF_FLOOR';

const ROUNDING_MODE_CODES: Readonly<Record<RoundingMode, Decimal.Rounding>> = {
  UP: Decimal.ROUND_UP,
  DOWN: Decimal.ROUND_DOWN,
  CEIL: Decimal.ROUND_CEIL,
  FLOOR: Decimal.ROUND_FLOOR,
  HALF_UP: Decimal.ROUND_HALF_UP,
  HALF_DOWN: Decimal.ROUND_HALF_DOWN,
  HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  HALF_CEIL: Decimal.ROUND_HALF_CEIL,
  HALF_FLOOR: Decimal.ROUND_HALF_FLOOR
};

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

function roundingCode(mode: RoundingMode): Decimal.Rounding {
  return ROUNDING_MODE_CODES[mode];
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export class DecimalValue {
  private readonly decimal: ConfiguredDecimal;

  private constructor(decimal: ConfiguredDecimal) {
    this.decimal = decimal;
  }

  static parse(value: string): Result<DecimalValue, DomainError> {
    if (!DECIMAL_PATTERN.test(value)) {
      return err(
        validationError('decimal/invalid-format', `Invalid decimal value '${value}'`, { input: value })
      );
    }
    return ok(new DecimalValue(new DecimalConfig(value)));
  }

  static fromInteger(value: number): Result<DecimalValue, DomainError> {
    if (!Number.isSafeInteger(value)) {
      return err(
        validationError('decimal/non-integer', `${String(value)} is not a safe integer`, {
          received: value
        })
      );
    }
    return ok(new DecimalValue(new DecimalConfig(value)));
  }

  static zero(): DecimalValue {
    return new DecimalValue(new DecimalConfig(0));
  }

  static sum(values: readonly DecimalValue[]): DecimalValue {
    let accumulator = DecimalValue.zero().decimal;
    for (const value of values) {
      accumulator = accumulator.add(value.decimal);
    }
    return new DecimalValue(accumulator);
  }

  static min(first: DecimalValue, second: DecimalValue, ...rest: readonly DecimalValue[]): DecimalValue {
    return [first, second, ...rest].reduce((smallest, value) =>
      value.decimal.cmp(smallest.decimal) < 0 ? value : smallest
    );
  }

  static max(first: DecimalValue, second: DecimalValue, ...rest: readonly DecimalValue[]): DecimalValue {
    return [first, second, ...rest].reduce((largest, value) =>
      value.decimal.cmp(largest.decimal) > 0 ? value : largest
    );
  }

  add(other: DecimalValue): DecimalValue {
    return new DecimalValue(this.decimal.add(other.decimal));
  }

  subtract(other: DecimalValue): DecimalValue {
    return new DecimalValue(this.decimal.sub(other.decimal));
  }

  multiply(other: DecimalValue): DecimalValue {
    return new DecimalValue(this.decimal.mul(other.decimal));
  }

  divide(
    other: DecimalValue,
    scale: number,
    mode: RoundingMode = 'HALF_UP'
  ): Result<DecimalValue, DomainError> {
    if (!isNonNegativeInteger(scale)) {
      return err(invalidScale(scale));
    }
    if (other.isZero()) {
      return err(
        validationError('decimal/division-by-zero', 'Cannot divide by zero', {
          dividend: this.decimal.toFixed()
        })
      );
    }
    const quotient = this.decimal.div(other.decimal).toFixed(scale, roundingCode(mode));
    return ok(new DecimalValue(new DecimalConfig(quotient)));
  }

  round(scale: number, mode: RoundingMode = 'HALF_UP'): DecimalValue {
    return new DecimalValue(new DecimalConfig(this.decimal.toFixed(scale, roundingCode(mode))));
  }

  abs(): DecimalValue {
    return new DecimalValue(this.decimal.abs());
  }

  compare(other: DecimalValue): number {
    return this.decimal.cmp(other.decimal);
  }

  equals(other: DecimalValue): boolean {
    return this.decimal.eq(other.decimal);
  }

  lessThan(other: DecimalValue): boolean {
    return this.decimal.lt(other.decimal);
  }

  greaterThan(other: DecimalValue): boolean {
    return this.decimal.gt(other.decimal);
  }

  isZero(): boolean {
    return this.decimal.isZero();
  }

  isNegative(): boolean {
    return this.decimal.isNegative();
  }

  toFixed(scale: number): string {
    return this.decimal.toFixed(scale);
  }

  toNumeric(precision: number, scale: number): Result<string, DomainError> {
    const { integerDigits, fractionalDigits } = digitCountsOf(this.decimal);
    const maxIntegerDigits = precision - scale;
    if (fractionalDigits > scale || integerDigits > maxIntegerDigits) {
      return err(
        validationError('decimal/numeric-overflow', `Value does not fit NUMERIC(${precision},${scale})`, {
          precision,
          scale
        })
      );
    }
    return ok(this.decimal.toFixed(scale));
  }

  percentOf(total: DecimalValue, scale: number): Result<DecimalValue, DomainError> {
    if (!isNonNegativeInteger(scale)) {
      return err(invalidScale(scale));
    }
    if (total.isZero()) {
      return err(
        validationError('decimal/division-by-zero', 'Cannot compute a percentage of zero', {
          total: total.decimal.toFixed()
        })
      );
    }
    const percent = this.decimal.div(total.decimal).mul(100).toFixed(scale, Decimal.ROUND_HALF_UP);
    return ok(new DecimalValue(new DecimalConfig(percent)));
  }

  toJSON(): string {
    return this.decimal.toFixed();
  }
}

function invalidScale(scale: number): DomainError {
  return validationError('decimal/invalid-scale', `Scale must be a non-negative integer, got ${scale}`, {
    scale
  });
}

function digitCountsOf(value: ConfiguredDecimal): { integerDigits: number; fractionalDigits: number } {
  if (value.isZero()) {
    return { integerDigits: 0, fractionalDigits: 0 };
  }
  const fractionalDigits = Math.max(value.dp(), 0);
  const magnitude = value.abs().e;
  const integerDigits = magnitude >= 0 ? magnitude + 1 : 0;
  return { integerDigits, fractionalDigits };
}
