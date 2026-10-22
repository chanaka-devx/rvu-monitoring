interface Clock {
  now(): Date;
}

interface IdGenerator {
  next(): string;
}

interface DecimalValue {
  toString(): string;
}

export function now(clock: Clock): Date {
  return clock.now();
}

export function nextId(ids: IdGenerator): string {
  return ids.next();
}

export function readDecimal(value: DecimalValue): string {
  return value.toString();
}
