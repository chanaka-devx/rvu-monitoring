# P02 handoff: platform infrastructure

## Final stage summary

| Stage | Commit | Local evidence |
| --- | --- | --- |
| A | a9f150c | integration infrastructure built previously |
| B | 5781c4a | configuration, pools and migrations built previously |
| C | 86ffacf | 5 tenancy integration tests passed |
| D | ecd2d9f | 3 outbox integration tests passed |
| E | HEAD (`feat(p2e)`) | jobs/HTTP integration, API runtime and generator gates |

The E commit is identified by HEAD in this versioned handoff to avoid a
self-referential hash. `git log -1 --format=%h` gives its hash at phase completion.
Historical blocked attempts below are retained as evidence; Docker connectivity
subsequently recovered and all integration suites executed successfully.

## Stage C implementation attempt - integration environment blocked

- Loaded the saved user-level DOCKER_HOST into the child command environment;
  `pnpm.cmd env:check` passed without the DOCKER_HOST warning.
- Added context tests, kernel UnitOfWork/CurrentTenant interfaces and exports,
  an AsyncLocalStorage context adapter, and tenancy integration tests. Added the
  platform's shared-kernel workspace dependency; install has not yet run.
- Context tests were observed failing on the missing adapter before implementation.
  Tenancy tests are not validated: roles and UoW adapters are still absent.
- Integration attempt first failed with no working container runtime strategy;
  `pnpm.cmd test:int` confirmed the Docker TCP endpoint was unreachable.
  Ran the documented `wsl docker ps` wake-up (existing containers only).
  A retry reached Vitest but global setup failed with `socket hang up`
  (`ECONNRESET`) before any tests ran. Stage A infrastructure is therefore not
  currently operational in this environment. Stopped per the stage gate rule.
- Stage C is incomplete; no stage commit was made. Preserve the uncommitted
  files for continuation after Docker TCP/Testcontainers connectivity is restored.

## Stage C resume preflight - blocked

- Branch `p2` was clean at the start of the resumed session; Stage A and B
  commits are `a9f150c` and `5781c4a`.
- `pnpm.cmd env:check` outside the sandbox confirms WSL Docker Engine and
  Docker Compose are reachable, but reports that `DOCKER_HOST` is unset.
  The P2 preflight explicitly requires this variable, so Stage C has not
  started. No implementation changes or stage commit were made.
- Set the user-level `DOCKER_HOST=tcp://localhost:2375` and restart the agent
  process so it inherits the variable before resuming Stage C.
- Required `database-design` skill is absent from `.agents/skills`; its
  fallback was found at `C:/Users/HP/.codex/skills/database-design/SKILL.md`.
  P01b and P01c handoffs remain absent, as previously recorded below.

## Status: implemented locally; remote CI pending owner push

## Stage D - transactional outbox and inbox

- Built EventPublisher, PgOutboxPublisher, EventBus/StoredEvent, OutboxDispatcher
  (start/stop/dispatchOnce/getOutboxStats), migration 0003, and configurable polling,
  batch size, attempts and backoff. ADR 0014 records accepted cross-tenant access.
- A standalone leader connection avoids starving an app pool of size one.
  Each consumer inbox and handler share a transaction; publication acknowledgement
  is separate. A fixed failure reason avoids retaining payloads in error messages.
- Evidence: verify:fast passed, 284 unit tests across the working tree. Docker
  recovered on the subsequent full integration attempt: C tenancy (5), D outbox
  (2 before the final ordering test), smoke (5), migrations (6), pool (2), API
  (3) passed. That attempt failed only in the E job provisioning test, since
  corrected and verified independently. Final full-run evidence follows in E.
- Skills: test-driven-development, typescript-pro, postgres-best-practices and
  database-design. Declined ORM/domain framework guidance; the requested bigserial
  outbox position is a transport sequence, not a domain identity.
- Public behavior: absent subscribers publish successfully; failed heads block
  only their practice/aggregate; dead heads stop blocking; Clock drives retries.
- Gap at this checkpoint: final ordering assertion awaits the full rerun.

## Stage C - Unit of Work, context, roles and RLS

- Built immutable nested ExecutionContext, PgUnitOfWork/getExecutor with nested
  transaction joining, CurrentTenant, role bootstrap, tenant RLS helpers, and
  a testing runtime URL helper. Public APIs are exported from package entries.
- Added db:bootstrap (tsx, same strategy as migrations), local credential
  examples and role setup documentation. ADR 0013 records security boundaries
  and future aggregate version hydration guidance.
- Evidence: pnpm verify:fast passed (280 tests). pnpm test:int failed at the
  Docker TCP preflight; integration validation is pending. The owner explicitly
  authorized continuing D/E despite blocked testing. C integration tests cover
  tenant isolation, insert/update denial, FORCE owner behavior, runtime role
  restrictions, commit/rollback/nesting and no connection-setting leakage.
- Skills: test-driven-development, typescript-pro, postgres-best-practices,
  database-design, docker-expert; nestjs-expert reserved for E. Declined ORM,
  domain decorators, serial domain IDs, Docker Desktop and bind mounts in favor
  of project hard rules. Outbox sequence IDs remain the specified exception.
- Gaps: integration tests have not executed; no live bootstrap/migration proof.
  Previous interrupted C files and handoff edits were ours and preserved.

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


## Stage B (commit `feat(p2b)`)

### Scope delivered

- `packages/platform` new workspace package (`@rvu/platform`): config
  loading/validation, pg pool factory, Kysely `createDb`, migration runner
  and CLI wiring.
- `config.ts`: `loadPlatformConfig(env)` with zod (not strict; ignores extra
  keys), fields `DATABASE_URL`, `APP_DATABASE_URL` (postgres URLs), numeric
  coercion for `DB_POOL_MAX` / `DB_STATEMENT_TIMEOUT_MS`, enum
  `LOG_LEVEL`; `PlatformConfigError` collects every failing key in one
  message (`-DATABASE_URL: Required`) and never prints secret values;
  `redactUrl` masks the password. 7 unit tests.
- `pool.ts`: `createPool(url, {max, statementTimeoutMs, applicationName})`.
  Statement timeout is applied through the startup-packet `options` param
  (`-c statement_timeout=...`), so it applies to the session before any
  query (verified: `SHOW statement_timeout` = `12300ms` when set to 12300).
  Type parsers: per-pool `types.getTypeParser` overriding NUMERIC (1700),
  DATE (1082), INT8 (20) to return strings and delegating all other OIDs
  (incl. binary format) to `pg.types`. timestamptz still parses to `Date`.
- `database.ts`: `createDb<DB>(pool)` (Kysely PostgresDialect). No DB types
  yet - Stage D repositories define their own.
- Migration runner: `migrations/migration.ts` (filename grammar
  `NNNN_snake_name.sql`, sha256 checksum with CRLF->LF normalization,
  migrationKey), `migrations/discovery.ts` (scans
  `packages/platform/migrations` + `modules/*/infrastructure/migrations`,
  sorts by owner then version, rejects invalid names, duplicate versions
  per owner and gaps, `MigrationDiscoveryError`; 4 tests via tmpdir
  repos), `migrations/runner.ts` (`runMigrations({pool, sources})`:
  advisory lock 70011001, ensures `platform.schema_migrations(owner,
  version, name, checksum, applied_at)`, checksum verification of applied
  migrations (tamper fails), duplicate + gap checks on the source list,
  each migration in its own transaction with INSERT of the bookkeeping row;
  6 int tests including two concurrent runners).
- `tools/migrate.mjs` (`pnpm db:migrate`): reads `.env` via
  `util.parseEnv` (process env wins), composes `DATABASE_URL` (and fallback
  `APP_DATABASE_URL`) from `POSTGRES_*`/`DB_PORT` when absent, then runs
  `packages/platform/src/migrate.ts` with `node --import tsx`. Output: 
  `Applied owner/version (name)`, `Database is up to date.`, target printed
  via `redactUrl`; non-zero exit on failure.
- Arch rules (B6) in `.dependency-cruiser.cjs`:
  `platform-only-shared-kernel` (workspace imports; test files exempt),
  `platform-no-banned-frameworks` (NestJS/ORM/etc; resolved
  `node_modules/[^/]+/node_modules/` patterns; `pg` not banned for
  platform), `modules-domain-application-no-db-runtime` (no
  `packages/platform`, `kysely`, `zod` in domain/application),
  `pg-and-job-queues-only-in-platform-or-tests`. New fixtures + tests:
  `platform-imports-testing`, `platform-nest-resolved`
  (resolved-externals stub convention), `domain-platform`; split into
  `tests/architecture/arch-platform.test.mjs`.
- ADR 0011 (Kysely typed SQL in platform) and ADR 0012 (tsx migration CLI,
  env composition). `AGENTS.md` Commands gained `db:migrate`.

### Evidence (gates)

- `pnpm verify` (DOCKER_HOST set): all checks passed; unit 278 tests green,
  int 13 tests green (3 suites: smoke, platform pool, migration runner).
- `pnpm verify:fast`: all checks passed.
- `pnpm db:up` -> `pnpm db:migrate` -> applied `platform/1
  (install_platform)`; second run `Database is up to date.`; target printed
  as `postgres://rvu:***@localhost:5432/rvu_monitoring`.
- `pnpm db:down` after; dev containers untouched.

### Decisions

1. **Statement timeout via startup packet** (`options` connection
   parameter) instead of a connection-level SET, to avoid a race where pool
   clients could run queries before a SET lands. Verified through
   `SHOW statement_timeout`.
2. **Type parsers delegate by default.** First cut returned `undefined` for
   unknown OIDs and broke pg-pool (`_parsers[i] is not a function`);
   final version only overrides the three target OIDs and delegates the
   rest (incl. binary) to `pg.types.getTypeParser`.
3. **safe-regex complaint on `[^/]*` store prefixes.** The first
   dependency-cruiser rule variants used
   `(^|/)node_modules/(?:\\.pnpm[^/]*/)?name` which dependency-cruiser
   rejects as unsafe via safe-regex. Replaced with
   `(^|/)node_modules/[^/]+/node_modules/name` (safe, and still catches the
   pnpm dedupe layout).
4. **Arch test split.** Running 24 dependency-cruiser fixtures sequentially
   in one vitest worker blocked the worker longer than vitest's 60 s RPC
   timeout (`Timeout calling onTaskUpdate`, unhandled error aborting the
   unit run). Moved the three new platform-boundary tests into
   `arch-platform.test.mjs` (second worker file); each file now stays well
   under the limit.
5. **`tsx` runs the migration CLI** (ADR 0012) with a root devDependency;
   `tools/migrate.mjs` spawns `node --import tsx` (no shell on win32:
   `spawnSync(process.execPath, [args])` quotes fine without `shell`),
   composes DATABASE_URL from compose vars. APP_DATABASE_URL defaults to
   the admin URL for now (no restricted role until Stage D).
6. **Runner gap/duplicate semantics** duplicated in the runner
   (`assertNoGaps`) so a hand-built source list fails fast before touching
   the database; discovery normally guarantees this for scanned repos.
7. **Test isolation via per-test owners** (inta..intf): the shared test
   database persists `platform.schema_migrations` rows within a run, so
   tamper/no-op/concurrency tests use distinct owners to avoid cross-test
   checksum collisions.

### Skills used

- Baseline: test-driven-development (config error-redaction test was the
  red before the fix; runner tamper/gap/duplicate int tests written against
  expected failure messages before implementation), typescript-pro
  (module/moduleResolution constraints: `import.meta` requires
  `module: node16/...`; worked around by passing RVU_REPO_ROOT from the
  .mjs tool instead of diverging the base tsconfig).
- Phase: postgres-best-practices (parameterized bookkeeping INSERT,
  advisory lock, per-migration transaction), database-design (UUIDv7
  policy untouched here, migrations only install bookkeeping schemas;
  NUMERIC/DATE/INT8 as strings enforced in the pool).

### Gaps

- `docker-compose.yml` untouched (Stage B did not need it); dev database
  now has `platform.schema_migrations` after `db:migrate` was exercised.
- `pnpm db:migrate` with a remote/odd `.env` containing `DATABASE_URL`
  already set is untested (tool defers to env; platform validation catches
  bad URLs).
- CI green check for the `integration` job still pending owner push.
- vitest unit-run worker RPC timeout (~60 s) is a standing constraint:
  keep per-fixture-heavy test files short or split; watch P7 when more
  arch rules/fixtures accumulate.

## Stage E - jobs, logging, correlation and API composition

### Built and public API

- Platform createLogger (Pino JSON, recursive credential redaction and context
  mixin), JobRunner (start/stop/enqueue/register), owner-provisioned pg-boss schema
  migration 0004, and ADR 0015. pg-boss is pinned to 12.38.0 to match the SQL.
- API PlatformModule exports config, app pool, logger, UnitOfWork, CurrentTenant,
  EventPublisher tokens, EventBus, OutboxDispatcher and JobRunner. Lifecycle hooks
  stop workers before pools. Runtime workers use rvu_app with migrations disabled.
- CorrelationIdMiddleware validates/echoes IDs or generates UUIDv7. Request logs
  contain method, route template, status, duration and correlation ID. ProblemFilter
  maps all domain kinds and HttpException statuses, concealing unexpected details.
- ReadyController executes select 1 with a 2-second deadline. Removed the previous
  placeholder ready route after the live smoke test exposed duplicate routing;
  /api/v1/health/live retains its existing behavior.
- tools/run-api.mjs loads the repo .env and explicitly selects the API tsconfig
  for legacy Nest decorators. Built start uses node --import tsx because workspace
  package entrypoints remain TypeScript. test:int now forwards suite arguments.
- tools/migrate.mjs no longer falls back to an owner-role APP_DATABASE_URL.
  README and .env.example document all settings and the full local quickstart.

### Evidence

- Final Windows full verify passed: 283 unit tests (30 suites), 25 integration
  tests (7 suites), typecheck, lint and architecture. Includes C RLS, D delivery,
  E HTTP and runtime-role job handling after removing the placeholder route.
  Fast gate also passed in earlier stage runs.
- API build succeeded. Built correlation adapter and Vitest both loaded the
  shared kernel/uuid ESM and generated UUIDv7 successfully on Node 22.18.
- Local db:up healthy; db:bootstrap succeeded using the documented development
  password; db:migrate applied platform/3 and platform/4. curl.exe returned
  HTTP 200 with {"status":"ok"} from /api/v1/health/ready. API was stopped after.
- Existing .env was preserved: it lacked APP_DB_PASSWORD, so dev values were
  supplied only to child commands. Bootstrap's first attempt rejected missing config.
- Generator gate: sample created, install/typecheck/lint/arch passed, sample removed,
  install passed, lockfile restored exactly to its intentional dependency state.
- No pushes, merges, branch switches, rebases or amendments. Initial handoff edits
  were ours from prior attempts; no unrelated changes were overwritten.

### Decisions, dependencies and remaining gaps

- pg-boss exported construction plans include BEGIN/COMMIT; these are stripped
  because runMigrations owns each transaction. Queue migrations must supply an
  explicit policy. exclusive policy supplies outstanding singletonKey deduplication.
- Runtime supervision/scheduling are disabled; a dedicated maintenance process is
  still needed before production (backlog). Owners must provision queues and grants.
- Dependencies: platform pg-boss/pino, API platform/kernel workspace links, API dev
  Nest testing/supertest/types/testing workspace link. No new root dependency.
- Skills used: test-driven-development, typescript-pro, nestjs-expert,
  postgres-best-practices, database-design, docker-expert. Used the global fallback
  for the absent local database-design skill. Declined ORM entities/decorators in
  domain, framework imports in platform, Docker Desktop/bind mounts and domain
  serial IDs; project rules and ADRs take precedence. No agents were delegated.
- CI matrix and Ubuntu integration status remain pending the owner's push.
  P01b/P01c handoffs were absent; prior notes above record that input gap.
