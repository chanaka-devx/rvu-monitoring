# P1a handoff: shared kernel

- Date: 2026-10-22
- Status: complete, with recorded gaps below
- Previous phase: `docs/phases/P00a-handoff.md`
- Branch: `p1a-shared-kernel`

## What was built

The shared kernel in `packages/shared-kernel/src`: 12 public units plus
re-exports from `index.ts`, each with a colocated property-based or example
test file. No module code, no other workspace imports (arch rule green).

| File | Public API |
| --- | --- |
| `brand.ts` | `Brand<T, B>`, `Uuid` (branded string), `PracticeId`, `isUuid(value: string): value is Uuid` |
| `result.ts` | `Result<T, E>` (`Ok`/`Err` union), `ok`, `err`, `isOk`, `isErr`, `map`, `mapErr`, `andThen`, `match`, `combine(results)` |
| `errors.ts` | `ErrorKind` (validation / not_found / conflict / forbidden / unauthenticated / unexpected), `DomainError` (`code`, `message`, `kind`, optional `details: Record<string, JsonValue>`), helpers `validationError`, `notFoundError`, `conflictError`, shared builder `errorOf` |
| `decimal-value.ts` | `DecimalValue` (immutable), `RoundingMode` (9 names, decimal.js parity) |
| `local-date.ts` | `LocalDate` (calendar date, no time zone): `parse`, `of`, `today(clock, timeZone)`, `toString`, `compare`, `equals`, `isBefore`, `isAfter`, `addDays`, `startOfMonth`, `endOfMonth`, `year`/`month`/`day` |
| `date-range.ts` | `DateRange` half-open `[start, end)`, `end` optional: `of(start, end \| null)` (Result), `contains`, `overlaps`, `intersection` |
| `value-object.ts` | `ValueObject<Props extends object>`: frozen props, `equals` (structural, constructor identity first) |
| `entity.ts` | `Entity<Id>`: `id`, `equals` by id and constructor |
| `aggregate-root.ts` | `AggregateRoot<Id> extends Entity<Id>`: `version` (starts at 0), `addDomainEvent`, `pullDomainEvents` (returns and clears) |
| `domain-event.ts` | `JsonValue`, `DomainEvent` (`eventId`, `eventType`, `aggregateType`, `aggregateId`, `occurredAt`, `schemaVersion`, `payload`, optional `correlationId`), `DomainEventInput`, `createDomainEvent(input, clock, ids)` |
| `clock.ts` | `Clock` port (`now(): Date`), `SystemClock` |
| `id-generator.ts` | `IdGenerator` port (`next(): Uuid`), `UuidV7Generator` |
| `pagination.ts` | `PageRequest`, `Page<T>`, `DEFAULT_PAGE_LIMIT = 50`, `MAX_PAGE_LIMIT = 200`, `normalizePageRequest` |

Error codes produced by this kernel (all kind `validation`):
`decimal/invalid-format`, `decimal/non-integer`, `decimal/division-by-zero`,
`decimal/numeric-overflow`, `decimal/invalid-scale`, `date/invalid-format`,
`date/invalid-calendar-date`, `range/invalid-order`.

## Verified commands

```powershell
pnpm install
pnpm typecheck
pnpm lint
pnpm arch
pnpm test
pnpm verify      # typecheck + lint + arch + test + test:int skip
pnpm build
```

- `pnpm test`: 243 tests in 18 files passed (198 in the shared kernel).
- `pnpm arch`: no violations; the shared-kernel-no-workspace-imports rule
  stays green (kernel imports only `decimal.js`, `uuid`, `vitest`, `fast-check`).
- Gate arithmetic verified: `0.1 + 0.2 = 0.3` exactly; property tests for
  add commutativity/associativity and `a.add(b).subtract(b).equals(a)`;
  `parse`/`toFixed` round trip; `toNumeric(12,4)` accepts `99999999.9999`
  and rejects `100000000` and `1.00001`; divide-by-zero errors;
  `368.percentOf(500, 2) = 73.60`. Leap-year date tests
  (2026-02-29 rejected, 2028-02-29 accepted), adjacent half-open ranges not
  overlapping, overlap symmetry, `pullDomainEvents` clearing, and
  `createDomainEvent` determinism with a fixed stub `Clock` and a sequential
  stub `IdGenerator` all pass.
- Remote CI (ubuntu/windows matrix) has not run yet; the local run is the
  Windows leg by construction and the test suite avoids platform-specific
  behavior (no `Math.random` seeding issues, ICU-dependent `Intl` timezone
  tests use standard IANA zones present in Node 22 on both OSes).

## Decisions and interpretations

1. **Result surface is function-based, not method-based.** `Result<T, E>` is a
   discriminated union of `Ok<T>`/`Err<E>` objects; the combinators
   (`map`, `mapErr`, `andThen`, `match`, `isOk`, `isErr`) are free functions
   taking the result as the first argument, matching the spec's
   `combine(results)` signature. Chaining is done by nesting calls.
2. **Arithmetic fallibility follows the phase spec literally.** Only `divide`
   and `percentOf` (and `parse`/`fromInteger`/`toNumeric`) return `Result`.
   `add`/`subtract`/`multiply`/`round`/`abs`/comparisons cannot fail within
   precision 40 and return values directly. `compare` returns `-1|0|1`
   (DecimalValue and LocalDate both).
3. **Rounding error beyond phase spec**: the Result-returning rounding APIs
   (`divide`, `percentOf`) also reject a negative or non-integer `scale` with
   `decimal/invalid-scale` instead of letting decimal.js throw. Non-Result
   APIs (`toFixed`, `round`) still surface decimal.js errors for invalid
   scale as programming errors. This is the one behavior not covered by a
   gate test.
4. **`toNumeric` counts significant fractional digits.** Trailing zeros do
   not count (`1.500000` fits `NUMERIC(12,4)`), so a value is rejected only
   if rounding would actually be needed. Zero is always representable
   regardless of `precision - scale` (matches SQL `NUMERIC` semantics).
   `toNumeric` returns the `toFixed(scale)` string (zero-padded to scale).
5. **decimal.js normalizes trailing zeros** (`'1.50'` parses to value `1.5`).
   `toFixed(scale)` re-renders any requested scale; `toJSON()` returns the
   canonical plain string (decimal.js `toFixed()` with no argument, never
   exponential notation).
6. **`isUuid` is a canonical-RFC-shape check**: lowercase, canonical 8-4-4-4-12
   form, variant bits `8|9|a|b`, any version nibble. It deliberately does not
   check the year of v7 time component or non-v7 versions; ids are validated
   as opaque strings here.
7. **`createDomainEvent` takes the two ports (`clock`, `ids`) exactly as
   specified** and returns a frozen-shape plain object. `eventId` is `Uuid`;
   `aggregateId` stays a plain `string` because aggregates own their own id
   type. Optional `correlationId` is omitted (not `undefined`) when absent,
   keeping `exactOptionalPropertyTypes` clean.
8. **`AggregateRoot.version` is currently a read-only getter (always 0).** No
   route to bump it was specified, so none was invented; persistence will
   decide in P10/P2 how loaded versions are restored (a protected setter is
   the likely change then).
9. **`ValueObject.equals(other: unknown)`** instead of a typed
   `ValueObject<Props>` parameter: the generics made cross-subtype calls fail
   to typecheck cleanly; runtime guard is `constructor` identity (bundle-safe,
   no `instanceof`), then structural deep equality of frozen props. Same
   pattern as `Entity.equals`.
10. **`LocalDate` supported year range is 1000-9999** (validated by a UTC
    round trip; `Date.UTC` maps years 0-99 into the 1900s, which is rejected).
    `toString()` always renders 4-digit years.
11. **`normalizePageRequest` clamps, does not throw**: absent/invalid
    `limit` (`< 1`, non-integer) becomes `DEFAULT_PAGE_LIMIT`; larger values
    clamp to `MAX_PAGE_LIMIT`; `cursor` passes through untouched.
12. **`DateRange.intersection` returns `DateRange | null`** (null = no shared
    day) rather than a Result, so the no-overlap case stays explicit but cheap.
13. **`SystemClock` and `UuidV7Generator` legitimately touch ambient state**
    (`new Date()`, random ids) in the kernel; the determinism lint only scopes
    modules, so these adapters live in the kernel by design, one place each.

## Dependencies (with reasons)

| Dependency | Kind | Reason |
| --- | --- | --- |
| `decimal.js` ^10.6.0 | runtime | Deterministic arithmetic behind `DecimalValue`; cloned config; no global mutation. |
| `uuid` ^14.0.0 | runtime | RFC v7 generation for `UuidV7Generator`. Upgraded from 10.0.0 during typecheck: uuid 10 ships no type declarations; v14 does (spec allows v10 or later). |
| `fast-check` ^4.10.2 | dev | Property tests only (test files are excluded from package `tsconfig`; vitest+SWC runs them). |
| `typescript` ^5.9.3 | dev | Already present from P0. |

## Root/config changes (scope list)

Root `vitest.config.ts`, root `tsconfig.base.json`, `turbo.json` and the
dependency-cruiser config were **not touched**: the package was already
registered (entry point exported, vitest includes `packages/**/*.test.ts`,
turbo runs its scripts). Only these were changed/added:

- `packages/shared-kernel/package.json` (dependencies only)
- `pnpm-lock.yaml` (dependency resolution)
- 13 `src/*.ts` + 13 `src/*.test.ts` + `src/index.ts` (rewritten)
- `docs/adr/0006-decimal-and-rounding.md`, `docs/adr/0007-dates-and-time.md`
- `docs/backlog.md` (three kernel-related backlog entries, per the phase
  prompt's "put ideas in docs/backlog.md"; not in the approved file list -
  flagged here)
- this handoff file

Total: 34 files - within phase sizing.

## Skills used

- Loaded (baseline): `test-driven-development`, `typescript-pro`.
- Loaded (phase): `ddd-tactical-patterns`, `clean-code`.
- Guidance applied: TDD red-green (tests written first, watched fail with
  "module missing", then implemented), aggregate/VO/Result/ports patterns,
  intention-revealing names, small functions, no comments unless justified.
- Guidance declined: `clean-code`'s "use exceptions instead of return codes"
  - superseded by the phase spec's `Result` type for fallible domain
  operations. `ddd-tactical-patterns`' repository contracts were not built -
  out of phase scope (kernel only). `typescript-pro`'s decorator/metadata
  focus was not applicable (no NestJS in this package).
- No guidance conflicts with AGENTS.md/ADR/phase rules were encountered,
  except where noted in Decisions (Result-vs-exception is an AGENTS/phase
  override, not a conflict).

## Working tree notes (files not created in this phase, left untouched)

- `AGENTS.md` - unstaged one-line addition (the never-delete rule).
- `docs/plan/implementation-plan.md` - unstaged P1 -> P1a/P1b split.
- Both changes are the owner's pre-session edits; left as-is per the
  never-modify rule.

## Recorded contradictions and known gaps

1. **No contradictions** between the phase build list and the plan/ADRs were
   found. One spec-interpretation was exercised: the "(Result, error on zero
   divisor)" clause was attached to `divide` only (see Decisions 2-3).
2. **`@types/uuid` avoided by using uuid ^14** (bundled types). If a later
   phase pins uuid to major 10 for compatibility, reintroduce `@types/uuid`.
3. **`DecimalValue` arithmetic silently rounds at significant-digit 40** for
   adversarially huge operands (decimal.js precision behavior). All crediting
   values are far below this; raised as a documented boundary, not a blocker.
4. **Test typechecking:** colocated `*.test.ts` files are excluded from the
   package tsconfig (repo convention), so their types are only exercised by
   vitest/SWC at runtime. A gradual move to running tsc over tests is a
   candidate backlog item.
5. **Remote CI not executed** (see Verified commands).
6. **No commit was created.** All changes are uncommitted for review.
7. **Potential backlog ideas (not built, per no-speculative-extras):**
   `DateRange` needs an equality helper used by tests only via fields; a
   reusable `min`/`max` on `Comparator`-style types for P1b arbitaries; the
   architecture suite runtime (already in backlog after P0a).
