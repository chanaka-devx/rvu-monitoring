import type { Clock } from './clock';
import { validationError, type DomainError } from './errors';
import { err, ok, type Result } from './result';

export class LocalDate {
  constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number
  ) {}

  static parse(value: string): Result<LocalDate, DomainError> {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match === null || match.length < 4) {
      return err(validationError('date/invalid-format', `Invalid date format '${value}'`, { input: value }));
    }
    const yearText = match[1];
    const monthText = match[2];
    const dayText = match[3];
    if (yearText === undefined || monthText === undefined || dayText === undefined) {
      return err(validationError('date/invalid-format', `Invalid date format '${value}'`, { input: value }));
    }
    return LocalDate.of(Number(yearText), Number(monthText), Number(dayText));
  }

  static of(year: number, month: number, day: number): Result<LocalDate, DomainError> {
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (
      utc.getUTCFullYear() !== year ||
      utc.getUTCMonth() !== month - 1 ||
      utc.getUTCDate() !== day
    ) {
      const rendered = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return err(
        validationError('date/invalid-calendar-date', `Not a real calendar date '${rendered}'`, {
          input: rendered
        })
      );
    }
    return ok(new LocalDate(year, month, day));
  }

  static today(clock: Clock, timeZone: string): LocalDate {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(clock.now());
    const pick = (type: Intl.DateTimeFormatPartTypes): number => {
      const part = parts.find((candidate) => candidate.type === type);
      return part === undefined ? Number.NaN : Number(part.value);
    };
    const year = pick('year');
    const month = pick('month');
    const day = pick('day');
    const date = LocalDate.of(year, month, day);
    if (!date.ok) {
      throw new Error(`Intl produced an invalid date ${year}-${month}-${day} for ${timeZone}`);
    }
    return date.value;
  }

  toString(): string {
    const year = String(this.year).padStart(4, '0');
    return `${year}-${String(this.month).padStart(2, '0')}-${String(this.day).padStart(2, '0')}`;
  }

  compare(other: LocalDate): number {
    if (this.year !== other.year) {
      return this.year < other.year ? -1 : 1;
    }
    if (this.month !== other.month) {
      return this.month < other.month ? -1 : 1;
    }
    if (this.day !== other.day) {
      return this.day < other.day ? -1 : 1;
    }
    return 0;
  }

  equals(other: LocalDate): boolean {
    return this.compare(other) === 0;
  }

  isBefore(other: LocalDate): boolean {
    return this.compare(other) < 0;
  }

  isAfter(other: LocalDate): boolean {
    return this.compare(other) > 0;
  }

  addDays(days: number): LocalDate {
    const shifted = new Date(Date.UTC(this.year, this.month - 1, this.day + days));
    return new LocalDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
  }

  startOfMonth(): LocalDate {
    return new LocalDate(this.year, this.month, 1);
  }

  endOfMonth(): LocalDate {
    return new LocalDate(this.year, this.month, daysInMonth(this.year, this.month));
  }
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}
