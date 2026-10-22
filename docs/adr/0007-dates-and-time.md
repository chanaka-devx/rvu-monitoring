# ADR 0007: Dates and time

- Status: Accepted
- Date: 2026-10-22
- Owners: RVU Monitoring team
- Phase: P1a

## Context

Service dates, effective-dated records (targets, schedules, mappings) and
reporting periods are all conceptually **calendar dates**, not instants. A
service rendered on 2026-10-22 is that date regardless of which office or time
zone produced the claim. JavaScript `Date` cannot represent a calendar date
without a time zone, so using `Date` for service dates would produce
off-by-one bugs whenever something serializes or renders it.

At the same time, crediting must be reproducible: reading "today" or generating
ids cannot depend on ambient process state (ADR 0005 bans `Date.now()` and
`new Date()` in domain and application code). Range logic for effective-dated
records must answer boundary questions deterministically: is a target valid on
the day the next one starts, and do adjacent periods overlap?

## Decision

- **`LocalDate` for calendar dates.** A time-zone-free value with `year`,
  `month`, `day`. `parse('YYYY-MM-DD')` is strict: real calendar dates only,
  including leap years (2028-02-29 is valid, 2026-02-29 is not). `of(y, m, d)`
  builds one from parts. `addDays`, `startOfMonth`, `endOfMonth`, `compare`,
  `isBefore`/`isAfter` and `equals` are exact and time-zone independent.
  Reading "today" is explicit: `LocalDate.today(clock, timeZone)` derives the
  calendar date from a `Clock` and an IANA time zone via `Intl`, so a service
  date is never derived from an implicit process time zone. The supported
  year range is what the UTC round-trip validates: 1000 to 9999.
- **`Clock` as the only source of time.** The port exposes `now(): Date`;
  `SystemClock` is the single place where the kernel reads the wall clock.
  Domain and application code never call `Date.now()` or `new Date()`; they
  take a `Clock`.
- **Half-open intervals `[start, end)` with an optional end.** `DateRange.of`
  requires `start` strictly before `end` (empty ranges rejected); `end` may be
  `null` meaning open-ended. `contains(date)` includes `start` and excludes
  `end`, so adjacent ranges (e.g. January ending 2026-02-01 and February
  starting 2026-02-01) never overlap and never double count a day.
  `overlaps` is symmetric; `intersection` returns `null` when the ranges share
  no days.

## Consequences

### Positive

- Service dates serialize as plain `YYYY-MM-DD` strings, render the same in
  every browser or report, and match CMS/claim conventions.
- Effective-dated lookups have one unambiguous boundary rule; a day belongs to
  exactly one adjacent period.
- Time in tests is injectable: a fixed `Clock` makes crediting deterministic
  without patching globals.
- The wall clock is touched in one adapter; every other place is pure.

### Negative

- Instant-time concerns (audit timestamps, request logs, `occurredAt`) still
  need `Date` and time zones; callers must not confuse the two layers.
- `LocalDate.toString` uses `YYYY-MM-DD`; parsing accepts only that shape, so
  looser inputs from imports need explicit mapping in the ingestion module.
- `intersection` returning `null` forces callers to handle the disjoint case
  explicitly.

### Follow-up

- Effective-dated record rules (overlaps rejected; point-in-time lookups at
  range boundaries) are enforced per module with repository and application
  logic in P5/P6, reusing these primitives.
- If scheduling later needs business calendars (holidays, provider leave), add
  them as domain services in the directory module, not in the kernel.

## Alternatives considered

- **`Temporal.PlainDate`.** Rejected: not stage-4 in the Node 22 baseline used
  by both CI platforms; the kernel must not depend on polyfills.
- **Storing `Date` with a fixed UTC hour.** Rejected: serialization and
  rendering still leak time zones and DST; the failure mode is exactly the
  off-by-one this design prevents.
- **Inclusive `start`/`end` ranges.** Rejected: adjacent inclusive ranges
  either overlap in the shared endpoint or force shifting conventions
  (`end = start of next - 1 day`), which caused double counting in
  effective-dated systems before.

## References

- ADR 0005: Layer and package dependency rules (determinism lint).
- ADR 0006: Decimal and rounding rules.
- `docs/phases/P01a-handoff.md`.
