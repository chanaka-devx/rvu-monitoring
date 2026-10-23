# P02 handoff: platform infrastructure

## Status: in progress

Stages are appended below as they complete. One commit per stage
(`feat(p2<letter>): <summary>`), stage gate green before the next stage
starts.

## Preflight fix (before Stage A) - 2026-10-23

The P2 preflight canary failed its gate, which stopped the phase per the
prompt: `pnpm arch` flagged `node:fs` in `modules/canary/domain/bad.ts` but
never `@nestjs/common`, because `options.exclude` in
`.dependency-cruiser.cjs` pruned every resolved `node_modules/...` path from
the graph before rules could match it (full analysis in ADR 0009). The
existing domain fixtures only passed for the *unresolved* import case.

With the owner's approval ("proceed"), the fix ran first as this stage:

- `.dependency-cruiser.cjs`: `exclude` narrowed to `dist|coverage|.turbo`;
  `doNotFollow: (^|/)node_modules/` keeps staying on top of third-party
  packages, but they remain in the graph.
- Canary re-run: `pnpm arch` now reports BOTH violations
  (`@nestjs/common` resolved to `node_modules/.pnpm/.../node_modules/@nestjs/common/index.js`
  and `fs`). Canary and `modules/*` leftovers then removed; working tree
  clean again; `pnpm-lock.yaml` unchanged.
- New fixture `tests/architecture/fixtures/domain-nest-resolved/` (tracked
  stub package under `stub-package/`, laid out at runtime into a
  `node_modules/.pnpm-stub/@stub/node_modules/@nestjs/common` pnpm-style
  path, so the resolved path really contains `node_modules/@nestjs/common`)
  and helper `runDepcruiseWithResolvedExternals()` in
  `tests/architecture/helpers.mjs`; new arch test asserts the resolved edge
  name and `node_modules/@nestjs/common` tail.
- All 243 existing tests still pass after the exclude change; new suite
  total is 244.
- New ADR `docs/adr/0009-resolved-imports-in-arch-fixtures.md` (this fills the
  ADR slot the P2 prompt assumed to exist; ADR 0008 stays reserved for the
  missing P1b/P1c material).

Files: `.dependency-cruiser.cjs`, `tests/architecture/helpers.mjs`,
`tests/architecture/arch.test.mjs`,
`tests/architecture/fixtures/domain-nest-resolved/*` (3 files),
`docs/adr/0009-resolved-imports-in-arch-fixtures.md`, this handoff.

Commit: `fix(p2pre): banned-import rules must see resolved node_modules imports`.

### Gate evidence

- Canary cycle (gen -> bad.ts -> install -> arch): 2 violations named; cleanup
  restored a clean tree (`git status` clean, `pnpm diff` on the lockfile
  empty).
- `pnpm test`: 244 tests passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm arch`: green.

### Skills used

- Baseline `test-driven-development` (canary gate = failing observation
  before the fix; fixture test asserts the named edge), `typescript-pro` not
  applicable (JavaScript config/test files).
- However: the fixture convention and helper mirrors the prompt's ADR 0009
  reference; the resolved-edge expectation follows `dependency-cruiser` docs.

### Gaps

- Remote CI for the excluded (`node_modules` now in-graph) arch run not yet
  observed locally on Linux; the change is platform-independent by
  construction (`doNotFollow`/`exclude` regexes have no path separator
  dependencies).
- ADR numbering: ADR 0008 left untouched and reserved; P1b/P1c handoffs and
  ADRs called out in the P2 prompt ("P01b-handoff.md, P01c-handoff.md",
  "ADR 0009") did not exist at session start. The present file supplied the
  missing resolved-imports ADR in slot 0009.

## Stage A - integration test infrastructure - 2026-10-23 (commit `feat(p2a)`)

### What was built

- `packages/testing` now owns the Postgres/Testcontainers entry points:
  - `postgres/image.ts`: `POSTGRES_IMAGE` (`postgres:16-alpine`), unit-tested
    against the image string in `docker-compose.yml`.
  - `postgres/container.ts`: `startPostgresContainer()` returning
    `{ adminUrl, stop }` (superuser `postgres`) via a dynamic
    `import('@testcontainers/postgresql')` so unit tests never load the
    module.
  - `postgres/test-database.ts`: `createTestDatabase(adminUrl)` creates
    `rvu_test_<hex>` (validated against `^[a-z][a-z0-9_]*$`, `<=63` bytes,
    CREATE ... TEMPLATE template0) and returns `{ url, name, drop }`; `drop`
    terminates connections, uses DROP ... IF EXISTS, and is idempotent.
    Helpers `buildTestDatabaseName`, `buildTestDatabaseUrl`,
    `isSafeIdentifier` are pure and unit-tested.
  - `postgres/global-setup.ts`: named `setup`/`teardown` exports; starts one
    container per run and `provide('postgresAdminUrl')`. See Decisions for
    the default-export teardown pitfall.
  - `postgres/use-test-database.ts`: `useTestDatabase()` registers
    beforeAll/afterAll and returns an object with a lazy `url` getter
    (destructure it only inside tests - the getter throws before
    beforeAll).
  - `postgres/provided-context.ts` augments vitest `ProvidedContext`.
- Root `vitest.int.config.ts`: `**/*.int.test.ts`, globalSetup path,
  `testTimeout: 60_000`, `hookTimeout: 180_000`, single fork,
  `fileParallelism: false`. Unit config already excluded int tests.
- `tools/test-int-preflight.mjs` + `tools/test-int.mjs`: file scan follows
  the P0 skip message; preflight decision is unit-tested with injected
  `connect`/`dockerInfo` (6 tests). Windows without `DOCKER_HOST` fails
  instantly with the ADR 0004 hint; with `DOCKER_HOST` it probes TCP with a
  2 s timeout and suggests `wsl docker ps`. Non-Windows runs `docker info`.
- `tools/verify.mjs --fast`; root scripts `verify` (unchanged behavior,
  documented as including test:int) and `verify:fast`.
- CI: separate `integration` job on `ubuntu-latest` (pnpm test:int); the
  verify matrix stays Docker-free on both OSes.
- `AGENTS.md` Commands updated; README got Windows daemon TCP instructions
  (127.0.0.1 binding), an "Integration tests" section and updated
  Commands/CI text.
- `docs/adr/0010-testcontainers-strategy.md`.

### Evidence (gates)

- `pnpm verify` (with DOCKER_HOST): all checks passed on Windows, unit 244
  + int 5 tests green.
- `pnpm verify:fast` (no DOCKER_HOST): all checks passed.
- `pnpm test` runs no int tests (no `smoke.int` in the unit run).
- `test:int` with `DOCKER_HOST` unset: fails in <5 s (instantly) with the
  actionable message.
- First Testcontainers run through the tcp DOCKER_HOST worked with
  Ryuk enabled and default host resolution; no
  `TESTCONTAINERS_RYUK_DISABLED`, no `TESTCONTAINERS_HOST_OVERRIDE`.
- After the run: no leftover test containers (teardown stops postgres
  immediately; Ryuk exits within ~1 minute).

### Decisions

1. **WSL2 Docker TCP endpoint enabled (environment change, documented).**
   The daemon previously published no TCP endpoint, so the preflight could
   never pass. With the owner's approval, `/etc/docker/daemon.json` was
   written (`hosts: ["unix:///var/run/docker.sock", "tcp://127.0.0.1:2375"]`)
   and a systemd drop-in resets `ExecStart=/usr/bin/dockerd`
   (`/etc/systemd/system/docker.service.d/override.conf`),
   `systemctl daemon-reload && systemctl restart docker`. Binding stays
   127.0.0.1 inside WSL2; WSL2 localhost forwarding exposes it to Windows.
   This closes the ADR 0004 follow-up. This is a machine change outside the
   repo (recorded here and in ADR 0010), and dev containers in WSL were
   restarted unnecessarily but came back healthy.
2. **Vitest 3 globalSetup teardown pitfall**: with a default export, vitest
   ignores the `teardown` named export
   (vitest dist cli-api `if (m.default) return { file, setup: m.default }`),
   which caused the postgres container to survive teardown (only Ryuk
   reaping removed it). Replaced with named `setup`/`teardown` and no
   default. Verified with an instrumented run before/after.
3. **`useTestDatabase()` returns a getter'ed object** rather than a
   destructurable promise; destructuring at collection time would call the
   getter before beforeAll and throw (caught in review once; documented).
4. `fileParallelism: false` + pools in addition to `singleFork` for defense
   in depth; the container is shared across the runs "one fork" anyway.
5. Tests connect through `pg` directly for the smoke test; `pg` is a runtime
   dependency of `@rvu/testing` (unit tests for the pure helpers need it,
   too).

### Skills used

- Baseline: test-driven-development (unit tests written and observed failing
  first: `test-database` helpers, preflight outcomes; implementation after),
  typescript-pro (typed ProvidedContext augmentation, dynamic import
  typing).
- Phase: docker-expert (WSL2 endpoint rules honored - 127.0.0.1 binding, no
  Docker Desktop; compose untouched), postgres-best-practices
  (CREATE DATABASE TEMPLATE template0, connection-count safety,
  pg_terminate_backend, parameterized queries).
- Declined guidance: n/a (no conflicting skill guidance encountered).

### Gaps

- CI (`integration` job) green check pending; pushed by the owner.
- `pnpm db:check`/`db:up` docs unchanged in this stage; quickstart gets its
  full update in Stage E (per the phase prompt).
- One lint nit fixed (`repoRoot` unused in the preflight test).
