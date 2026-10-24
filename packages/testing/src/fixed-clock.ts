import type { Clock } from '@rvu/shared-kernel';

export class FixedClock implements Clock {
  private current: Date;

  constructor() {
    this.current = new Date(0);
  }

  set(date: Date): void {
    this.current = new Date(date.getTime());
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }

  now(): Date {
    return new Date(this.current.getTime());
  }
}
