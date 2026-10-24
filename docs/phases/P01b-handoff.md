# P1b handoff: test foundation and acceptance scenario

- Date: 2026-10-22
- Status: complete, with recorded gaps below
- Previous phase: `docs/phases/P01a-handoff.md`
- Branch: `p1b-test-foundation`

## What was built

`packages/testing` (the whole package), the outer acceptance test for the
brief's 360 -> 368 scenario, ADR 0008, the kernel scale-validation tests
(tests only), and one root vitest config line. TDD was followed: all test
files were written and watched failing (`Cannot find module ...` /
`expectOk is not a function`) before the implementations were added.

### Public API of `@rvu/testing` (via `packages/testing/src/index.ts`)

| Import | Item | Notes |
| --- | --- | --- |
| `FixedClock` | fixed-clock | `implements Clock`; `set(date)`, `advance(ms)`; `now()` returns a fresh `Date` each call. Starts at epoch. |
| `SequentialIdGenerator` | sequential-id-generator | `implements IdGenerator`; `new SequentialIdGenerator(start?)`; ids are canonical lowercase UUIDs passing `isUuid` with version 7 / variant a; two fresh instances produce identical sequences; ids are `counter`-derived (`xxxxxxxx-0000-7000-a000-xxxxxxxxxxxx`). |
| `createRandom`, `Random` | seeded-random | mulberry32; `next()` in [0,1), `int(min,max)` inclusive, `pick(array)`, `chance(probability)`. |
| `expectOk(result)`, `expectErr(result)` | result-helpers | Return the value/error; throw messages carrying the `DomainError` code and message otherwise. |
| `aProvider`, `aServiceLine`, `anRvuEntry` | synthetic/builders | Deterministic defaults; overrides win; explicit `versionRef: undefined` removes the key (`exactOptionalPropertyTypes`-safe); date overrides accept `LocalDate`, a `YYYY-MM-DD` string, or `{year,month,day}` (`SyntheticDateInput`, via `toLocalDate`). |
| `toLocalDate`, `SyntheticDateInput`, `SyntheticProvider`, `SyntheticRvuEntry`, `SyntheticServiceLine` | synthetic/types | Line fields are exactly the 13 allowlisted ones; no patient fields. |
| `generateDataset`, `DatasetOptions`, `SyntheticDataset` | synthetic/dataset | `{seed, providers, days, linesPerDay, startDate?}` -> `{providers, rvuEntries, lines}`; codes drawn from Z0001..Z0099; every line's code exists in `rvuEntries`; posted date is service date +0..2 days; provider/location ids deterministic. |
| `SERVICE_LINE_CSV_COLUMNS`, `toCsv` | synthetic/csv | Header first, one line per `SyntheticServiceLine` in column order; LF-only rows; comma/quote/CR/LF fields quoted with doubled quotes; modifiers joined with `|`; dates `YYYY-MM-DD`; missing `versionRef` is `''`. |
| `briefScenario`, plus `lines`, `resolutions`, `expected` (also exported as `briefLines`, `briefResolutions`, `briefExpected` from the index to avoid bare common names) | brief-scenario | The brief's example as data; all RVU values are `DecimalValue`. |
| `decimalArb`, `localDateArb` (year 2000-2100), `dateRangeArb` | arbitraries | Built on kernel constructors via `expectOk`; generators are constructed to only emit valid values (dates clamp to the month length; ranges always have `start` before `end` or are open-ended). |

### Brief-scenario shape

```ts
interface BriefScenario {
  provider: SyntheticProvider;          // provider-0001, "Provider 1"
  providerTarget: DecimalValue;         // 500
  rvuEntries: SyntheticRvuEntry[];      // Z0003 = 3.0, Z0001 = 2.0, effective 2026-01-01..open
  lines: SyntheticServiceLine[];        // 60 confirmed (Z0003 x 2 units = 6 wRVU each) + 3 review lines (Z0001, status 'pending')
  resolutions: BriefResolution[];       // 3 entries, one per review line:
                                        //   { sourceLineId, reviewReason, outcome:
                                        //      {kind:'credited', wrvu:'4'} x2  (modifier-not-supported, no-rvu-value)
                                        //      {kind:'excluded', reason} x1    (duplicate-of-existing-credit) }
  expected: {
    before: { confirmedWrvu: '360', percentOfTarget: '72.00', unresolved: 3, adjustmentWrvu: '0', excludedLines: 0 };
    after:  { confirmedWrvu: '368', percentOfTarget: '73.60', unresolved: 0, adjustmentWrvu: '8', excludedLines: 1 };
  };
}
```

`expected` is derived inside the fixture by summing the line/rvu data with
`DecimalValue` and computing percentages with `percentOf(..., 2)`, so it
cannot silently drift from `lines`. The acceptance test separately asserts
the literal gates 360 -> 72.00 and 368 -> 73.60.

### Acceptance test (`tests/acceptance/brief-scenario.acceptance.test.ts`)

- A running block that re-derives 360 (confirmed lines only; the 3 pending
  review lines are outside it), 72.00 percent, the 8 wRVU adjustment, 368
  and 73.60 percent, `unresolved: 0`, one excluded line - all through
  `DecimalValue`.
- A `describe.skip('end-to-end (enabled in P11)')` block with four
  `it.todo` steps (CSV import, 72 % + 3 unresolved dashboard, two
  resolutions + one exclusion, 73.6 % + traceable 8 wRVU adjustment). It
  typechecks without importing anything that does not exist yet (it only
  imports the kernel and this package) and is reported as `4 todo`.

### Kernel test additions (the single allowed existing-file change)

`packages/shared-kernel/src/decimal-value.test.ts` gained one
`describe('scale validation')` block: `divide` and `percentOf` with scales
-1, -100, 0.5, 1.5, NaN, +Inf return `decimal/invalid-scale` (kind
validation, details `{scale}`), `toFixed`/`round` with the same invalid
scales throw, and scale 0 computes (2.5/2 -> '1', 368 of 500 -> '74').

TDD note: these tests were written in the RED step but pass immediately -
they pin existing kernel behavior (the kernel validates scale in
`divide`/`percentOf` and delegates `toFixed`/`round` to decimal.js, which
throws `[DecimalError] Invalid argument`). Per the phase instruction no
kernel source was touched, so nothing failed and nothing was changed.

### Root config change (listed per phase instructions)

`vitest.config.ts`: added `'tests/**/*.test.ts'` to `include`. This was
strictly required: the existing include list covered only
`tests/**/*.test.mjs`, so `tests/acceptance/brief-scenario.acceptance.test.ts`
was never picked up. Nothing else in the config was changed.

## Verified commands

```powershell
pnpm install
pnpm typecheck    # 4 packages successful
pnpm lint         # clean
pnpm arch         # no dependency violations found (54 modules, 83 dependencies)
pnpm test         # 321 passed + 4 todo in 29 files
pnpm verify       # typecheck + lint + arch + test + test:int skip all passed
```

- `tests/acceptance` reports `8 passed | 4 todo (12)` on its own; the four
  todo steps are the skipped P11 block, exactly as required by the gate.
- Remote CI (ubuntu and windows) has not run; the suite contains no
  platform-specific behavior (no wall-clock, no `Math.random`, seeded
  generation only), so both legs are expected to match the Windows run.

## Dependencies

| Dependency | Kind | Reason |
| --- | --- | --- |
| `@rvu/shared-kernel` `workspace:*` | runtime | Ports (`Clock`, `IdGenerator`), `DecimalValue`, `LocalDate`, `DateRange`, `isUuid`, `Result`. The only workspace import allowed by the P0a arch rule (`testing-only-shared-kernel`), which stays green. |
| `fast-check` `^4.0.0` | dev | The same version range the kernel's manifest declares; used by `arbitraries.ts` (test-only consumers) and package tests. Placed in devDependencies mirroring the kernel's manifest; because arbitraries are consumed only by test code, this does not create a runtime edge for the product. |
| `typescript` `^5.9.3` | dev | Already present from P0. |

`pnpm-lock.yaml` changed by exactly one 7-line importers block for
`packages/testing` (verified with `git diff`).

## Resolution import paths in `tests/acceptance`

The acceptance test imports
`../../packages/shared-kernel/src` and `../../packages/testing/src` by
relative path. Rationale: resolving `@rvu/testing` from `tests/` would
require making the root package depend on workspace packages, and the root
`package.json` is outside this phase's scope. When P8+ phases build the
real ingestion path this stays compatible (all future acceptance runs live
in the same tree). Recorded as a decision, not a gap.

## Decisions and interpretations

1. **`Random` and helpers are interfaces, not classes**, mirroring the
   kernel's `Clock`/`IdGenerator` port style. `createRandom` closes over the
   mulberry32 state; nothing ambient is read.
2. **`SequentialIdGenerator` uuid layout is
   `xxxxxxxx-0000-7xx0-a000-xxxxxxxxxxxx` derived from the counter** in the
   first and last groups, so two fresh instances with the same `start`
   produce identical sequences and any single instance never repeats until
   the counter group wraps (first repeat after 2^32 ids; the generator is
   a test fixture, not a production id source). This is documented further
   in ADR 0008's seeded-determinism section.
3. **`versionRef` clearing semantics.** Not passing `versionRef` to
   `aServiceLine` gives the deterministic default `'1'`; passing
   `versionRef: undefined` explicitly removes the key so
   `exactOptionalPropertyTypes` stays clean and CSV writes an empty cell.
   `'versionRef' in overrides` distinguishes the two cases.
4. **`anRvuEntry` accepts `workRvu` (a `DecimalValue`) or
   `workRvuString`** so dataset code can pass generated strings without
   wrapping each parse by hand. Both paths parse strictly through
   `DecimalValue.parse` when a string is given.
5. **Dataset is lines-first**: lines are generated and the set of codes
   they use defines `rvuEntries` (one entry per distinct code), so every
   line always has a matching schedule entry. `rvuEntries` length is
   therefore data-derived; the requested-counts gate covers `providers`
   and `lines`, which is what the phase requires.
6. **`expected` is computed inside `brief-scenario.ts` from its own line
   data** (`DecimalValue.sum` over final lines, `percentOf(..., 2)`), and
   the acceptance test independently asserts the literal numbers (360 /
   72.00 / 368 / 73.60). One source of truth per direction, checked both
   ways.
7. **Review reasons live on `resolutions`, not on `SyntheticServiceLine`**
   - the phase locks the line field set to 13 fields, and adding a
   `reviewReason` field there would enlarge the PHI allowlist surface for
   synthetic data unrelated to review.
8. **The CSV snapshot parser lives inside `csv.test.ts` only** (phase
   instruction). It is a deliberately minimal quoted-field parser; P8's
   streaming parser will be tested against its own fixtures.
9. **vitest `include` addition is a listed change**, not a silent one (see
   above). No turbo/tsconfig/dependency-cruiser change was needed.

## Skills used

- Loaded (baseline): `test-driven-development`, `typescript-pro`.
- Loaded (phase): `clean-code`.
- Applied: RED -> GREEN (12 new failing test files watched failing before
  implementation; kernel additions documented as behavior-pinning), test
  data builders, ports, deterministic seeded generation, property-based
  tests with bounds-enforcing generators, small functions, no comments in
  source, intention-revealing names.
- Declined: `clean-code`'s "use exceptions instead of return codes" for the
  same reason P1a recorded - the phase/kernel contract is `Result`-based,
  and `expectOk`/`expectErr` deliberately translate `Result` misuse into
  thrown test failures at the test boundary only. `typescript-pro`'s
  decorator/metadata guidance was again not applicable (no NestJS here).

## Working tree notes (files not created in this phase, left untouched)

- The `p1a-shared-kernel` merge was performed by the owner before work
  started; this branch now carries the kernel commit `3de72dc`.
- `packages/shared-kernel/dist` and `packages/testing/dist` plus
  `.turbo/` cache dirs are stale ignored leftovers from the earlier P1a
  session; gitignored, not touched.
- `docs/plan/implementation-plan.md` still shows P0a as "Next" and P1a as
  "Next" even though both are built; that table update belongs to the
  owner's bookkeeping and was left unchanged (this phase, like P1a, adds a
  `docs/phases/PXX-handoff.md` instead).

## Recorded contradictions and known gaps

1. **P1a/P1b branch state contradiction, resolved by the owner.** The
   phase prompt assumed `docs/phases/P01a-handoff.md` and the kernel were
   already on this branch; both lived only on `p1a-shared-kernel`. The
   owner merged before implementation started; the full P1a state
   (kernel, ADRs 0006/0007, P01a handoff) is present here. No workaround
   was applied by the agent; documented in the approval exchange.
2. **`docs/backlog.md` has a stray blank line between the two sections**
   (pre-existing from P1a's appended entries). Append-only discipline was
   honored; no cleanup was performed.
3. **The kernel mega-test file is now 92 tests in one file**; the added
   scale-validation block adds 4 descriptions / 27 cases. Fine for now;
   the file is large but still single-purpose.
4. **Property tests use `numRuns` 500** (default for fc, declared
   explicitly in the acceptance assert options) - runtime stayed under 3 s
   for the arbitraries file. No mutation testing was specified for this
   phase.
5. **Remote CI not executed** (noted above). `pnpm env:check` was not part
   of the gate for this phase, and no Docker was needed (no integration
   tests added; `pnpm test:int` remains the P0 skip-wrapper).
6. **No commit was created.** All changes are uncommitted for review.

## File inventory (18 files, within the ~35 limit)

- Modified: `packages/testing/package.json`,
  `packages/testing/src/index.ts`,
  `packages/shared-kernel/src/decimal-value.test.ts` (tests only),
  `vitest.config.ts`, `pnpm-lock.yaml`, `docs/backlog.md` (append-only).
- New: `packages/testing/src/{fixed-clock,sequential-id-generator,
  seeded-random,result-helpers,arbitraries,brief-scenario}.ts` plus their
  colocated `.test.ts` files,
  `packages/testing/src/synthetic/{types,builders,dataset,csv}.ts` plus
  their colocated `.test.ts` files,
  `tests/acceptance/brief-scenario.acceptance.test.ts`,
  `docs/adr/0008-synthetic-data.md`, this handoff.
