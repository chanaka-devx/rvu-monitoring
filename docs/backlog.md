# Backlog

## Tooling

- **Rename `tools/doctor.mjs` to `tools/env-check.mjs`.** The script was renamed
  to `env:check`, but the file name still says doctor. Rename the file and update
  its unit test once the P00 references are no longer needed for traceability.
- **Architecture test runtime.** `tests/architecture/` spawns one
  dependency-cruiser process per fixture, so the suite takes roughly 20-25
  seconds and grows with each new rule. Consider using the dependency-cruiser
  programmatic API to cruise all fixtures in one process, or cache cruise
  results between tests.

## Shared kernel

- **Typecheck kernel test files.** Colocated `*.test.ts` files are excluded
  from the package tsconfig (repo convention), so test types are only
  exercised at runtime by vitest/SWC. Consider running `tsc` over tests too,
  or moving the exclusion decision out of the per-package tsconfig.
- **AggregateRoot version restore hook.** `version` is read-only (starts at
  0) until persistence needs to restore loaded versions; decide the protected
  hook together with the P2 repository mappings.
- **P1b arbitraries.** The property-test generators for decimals and dates
  are defined inline per test file; extract reusable fast-check arbitraries
  into `packages/testing` in P1b as planned.
- **Typecheck acceptance tests.** `tests/acceptance/*.test.ts` (and
  `packages/testing` colocated tests) are not covered by any package
  tsconfig; they run through vitest/SWC only. The item above applies to them
  too once a shared test-tsconfig approach is chosen.


- Typecheck test files (they are excluded from package tsconfigs). Do before P7.
- AggregateRoot.version is read-only (always 0): decide the restore/bump
  mechanism in P2 (optimistic concurrency).
- Confirm uuid ^14 works when apps/api imports the kernel (ESM-only risk), and
  that CI uses Node 22.12 or newer. Check in P2.
- Skills map: P1b uses clean-code only (ddd-tactical-patterns was P1a).
- **Brief-scenario dataset size.** The brief fixture hand-builds 63 lines;
  if P8/P9 want a large-scale golden test, add a `generateDataset` variant
  with bounded `linesPerDay` reusing the brief's resolutions, rather than
  extending the hand-built fixture.
- **Visible npm endpoints in the arch report.** The P1c exclude change (ADR 0009) keeps vitest/fast-check/testcontainers dependencies visible in the report; other direct npm imports are now reported too (e.g. decimal.js). If the module/dependency counts balloon once production dependencies land in P2+ (NestJS, drizzle), tighten the exclude granularity.

- **P07: brief-scenario fixture vs ReviewReason.** When the crediting
  application layer (P11) consumes acceptance fixtures, align the hand-built
  brief-scenario expectations with the shipped `ReviewReason` values (for
  example `status_requires_review`, `no_schedule_available`) instead of the
  looser descriptors used today.
- **P07: encounter-level modifier rules.** `resolveModifiers` treats every
  line independently; encounter-level aggregation (bundled codes sharing one
  visit resolving to a single payment, per CMS rules) is a later phase.
