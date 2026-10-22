import { validationError, type DomainError } from './errors';
import { LocalDate } from './local-date';
import { err, ok, type Result } from './result';

export class DateRange {
  constructor(
    readonly start: LocalDate,
    readonly end: LocalDate | null
  ) {}

  static of(start: LocalDate, end: LocalDate | null): Result<DateRange, DomainError> {
    if (end !== null && !start.isBefore(end)) {
      return err(
        validationError('range/invalid-order', `Range start ${start.toString()} must be before end ${end.toString()}`, {
          start: start.toString(),
          end: end.toString()
        })
      );
    }
    return ok(new DateRange(start, end));
  }

  contains(date: LocalDate): boolean {
    return !date.isBefore(this.start) && (this.end === null || date.isBefore(this.end));
  }

  overlaps(other: DateRange): boolean {
    const thisEnd = this.end;
    const otherEnd = other.end;
    const beforeOtherEnd = otherEnd === null || this.start.isBefore(otherEnd);
    const beforeThisEnd = thisEnd === null || other.start.isBefore(thisEnd);
    return beforeOtherEnd && beforeThisEnd;
  }

  intersection(other: DateRange): DateRange | null {
    const start = this.start.isAfter(other.start) ? this.start : other.start;
    const end = earliestEnd(this.end, other.end);
    if (end === null) {
      return new DateRange(start, null);
    }
    return start.isBefore(end) ? new DateRange(start, end) : null;
  }
}

function earliestEnd(left: LocalDate | null, right: LocalDate | null): LocalDate | null {
  if (left === null || right === null) {
    return null;
  }
  return left.isAfter(right) ? right : left;
}
