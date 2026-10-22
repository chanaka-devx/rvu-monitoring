export abstract class ValueObject<Props extends object> {
  protected readonly props: Props;

  protected constructor(props: Props) {
    this.props = Object.freeze(props);
  }

  equals(other: unknown): boolean {
    const candidate = other as { constructor?: unknown; props?: unknown } | null | undefined;
    if (candidate === null || candidate === undefined) {
      return false;
    }
    if (candidate.constructor !== this.constructor) {
      return false;
    }
    if (candidate.props === undefined) {
      return false;
    }
    return deepEquals(this.props, candidate.props);
  }
}

function deepEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((item, index) => deepEquals(item, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key) => key in right && deepEquals(left[key], right[key]))
    );
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
