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


- Typecheck test files (they are excluded from package tsconfigs). Do before P7.
- AggregateRoot.version is read-only (always 0): decide the restore/bump
  mechanism in P2 (optimistic concurrency).
- Confirm uuid ^14 works when apps/api imports the kernel (ESM-only risk), and
  that CI uses Node 22.12 or newer. Check in P2.
- Skills map: P1b uses clean-code only (ddd-tactical-patterns was P1a).
