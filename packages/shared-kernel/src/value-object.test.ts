import { describe, expect, it } from 'vitest';
import { ValueObject } from './value-object';

class Code extends ValueObject<{ readonly code: number }> {
  constructor(code: number) {
    super({ code });
  }
  get value(): number {
    return this.props.code;
  }
}

class OtherVo extends ValueObject<{ readonly code: number }> {
  constructor(code: number) {
    super({ code });
  }
}

describe('ValueObject', () => {
  it('freezes its props', () => {
    const vo = new Code(7);
    expect(Object.isFrozen(vo.props)).toBe(true);
  });

  it('equals a value object with equal props', () => {
    expect(new Code(7).equals(new Code(7))).toBe(true);
  });

  it('does not equal a value object with different props', () => {
    expect(new Code(7).equals(new Code(8))).toBe(false);
  });

  it('does not equal a value object of another type', () => {
    expect(new Code(7).equals(new OtherVo(7))).toBe(false);
  });

  it('equals itself', () => {
    const vo = new Code(7);
    expect(vo.equals(vo)).toBe(true);
  });
});
