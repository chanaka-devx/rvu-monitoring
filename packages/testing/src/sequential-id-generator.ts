import { isUuid, type Uuid } from '@rvu/shared-kernel';

const UUID_COUNTER_MASK = 0xffffffff;

function pad(value: number, length: number): string {
  return value.toString(16).padStart(length, '0');
}

export class SequentialIdGenerator {
  private counter: number;

  constructor(start = 0) {
    this.counter = Number.isSafeInteger(start) && start >= 0 ? start : 0;
  }

  next(): Uuid {
    const id = `${pad(this.counter & UUID_COUNTER_MASK, 8)}-0000-7000-a000-${pad(
      this.counter % 0x1000000000000,
      12
    )}`;
    if (!isUuid(id)) {
      throw new Error(`SequentialIdGenerator produced a non-UUID id: ${id}`);
    }
    this.counter += 1;
    return id;
  }
}
