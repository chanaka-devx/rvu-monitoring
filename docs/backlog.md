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
