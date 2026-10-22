interface Clock {
  now(): Date;
}

export function isAfter(clock: Clock, other: Date): boolean {
  return clock.now().getTime() > other.getTime();
}
