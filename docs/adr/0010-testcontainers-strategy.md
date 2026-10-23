# ADR 0010: Testcontainers strategy for integration tests

- Status: Accepted
- Date: 2026-10-23
- Owners: RVU Monitoring team
- Phase: P2 (Stage A)

## Context

Phase P2 requires integration tests (`*.int.test.ts`) that start real
PostgreSQL. The developer host is Windows; Docker Engine lives only inside
WSL2 Ubuntu (ADR 0004), and libraries reach it through
`DOCKER_HOST=tcp://localhost:2375`. CI runs on `ubuntu-latest` and
`windows-latest`. Node unit tests (vitest without Docker) must never load the
Testcontainers dependency tree.

At the start of the phase, the WSL2 daemon did not publish any TCP endpoint
and `DOCKER_HOST` was not exported, so the ADR 0004 follow-up "verify the
DOCKER_HOST TCP endpoint is enabled" was still open.

## Decision

### Test harness shape

- `packages/testing` owns the Docker/Postgres entry points
  (`startPostgresContainer()`, `createTestDatabase()`, the Vitest
  `globalSetup`, and the `useTestDatabase()` helper). It depends on
  `testcontainers`, `@testcontainers/postgresql` and `pg`; `testcontainers`
  is loaded through dynamic `import()` so unit tests never parse it.
- One container per run: the Vitest `globalSetup` starts one
  `postgres:16-alpine` container (superuser `postgres`, same image constant
  as `docker-compose.yml`) and `provide('postgresAdminUrl', ...)`. Teardown
  stops it.
- One database per test file: `createTestDatabase(adminUrl)` creates a
  throwaway `rvu_test_<hex>` database (identifier validated against
  `^[a-z][a-z0-9_]*$`, quoted, never interpolated from user input); `drop()`
  terminates connections and drops safely, twice.
- `vitest.int.config.ts` collects `**/*.int.test.ts` with `testTimeout` 60 s,
  `hookTimeout` 180 s, a single fork (`singleFork`), `fileParallelism: false`
  one process shares the one container. The unit config excludes
  `*.int.test.ts`.

### Windows/WSL2 endpoint

The WSL2 Docker daemon publishes only the unix socket plus
`tcp://127.0.0.1:2375`. Because the daemon must keep its 127.0.0.1 binding,
this was configured with `/etc/docker/daemon.json`
(`{ "hosts": ["unix:///var/run/docker.sock", "tcp://127.0.0.1:2375"] }`) and
a systemd drop-in (`ExecStart=` then `ExecStart=/usr/bin/dockerd` in
`/etc/systemd/system/docker.service.d/override.conf`), then
`systemctl daemon-reload && systemctl restart docker`. WSL2 localhost
forwarding exposes the port to Windows; Docker Desktop stays forbidden.

This ADR closes the ADR 0004 follow-up about enabling the TCP endpoint.

### Tools

- `pnpm test:int` (`tools/test-int.mjs`) first checks that `*.int.test.ts`
  files exist (no files: still exits 0 with the P0 skip message), then runs a
  preflight (`tools/test-int-preflight.mjs`, unit-tested with injected
  dependencies):
  - win32 without `DOCKER_HOST`: fails in milliseconds with the message to
    set `DOCKER_HOST=tcp://localhost:2375` and the ADR 0004 reference;
  - win32 with `DOCKER_HOST`: TCP-connects with a 2 s timeout and, on
    failure, points to `wsl docker ps` (WSL may be idle);
  - other platforms without `DOCKER_HOST`: runs `docker info` (local socket);
  - other platforms with `DOCKER_HOST`: the same TCP probe.
- `pnpm verify` is typecheck + lint + arch + test + test:int on every
  platform; `pnpm verify:fast` runs the same without `test:int`.

### CI split

- The `verify` matrix keeps `ubuntu-latest` + `windows-latest` for typecheck,
  lint, arch and unit tests only (no Docker).
- A separate `integration` job runs on `ubuntu-latest` only and executes
  `pnpm test:int` against the runner's local Docker socket (no
  `DOCKER_HOST` needed). Windows runners do not run integration tests: the
  tcp endpoint and WSL tooling are developer-host specific, and the Linux
  runner covers the same code path.

## Findings during bring-up

- **Vitest 3 globalSetup teardown requires named exports.** A module with a
  `default` export plus a `teardown` named export loses its teardown: vitest
  returns `{ file, setup: m.default }` and never looks at `m.teardown`
  (dist/chunks/cli-api.DVe0nWUx.js). The fix is `export async function
  setup(...)` and `export async function teardown(...)` with no default.
  Symptom was the postgres container surviving teardown and only disappearing
  ~1-2 minutes later through Ryuk reaping.
- **Ryuk works through the tcp `DOCKER_HOST` on Windows.** No
  `TESTCONTAINERS_RYUK_DISABLED` or `TESTCONTAINERS_HOST_OVERRIDE` was
  needed; the `postgres` container and its reaper are gone about a minute
  after teardown.
- The default test arbitrary `Connection URI` of
  `@testcontainers/postgresql` resolves the correct host on Windows through
  the tcp `DOCKER_HOST`; the tests connect to `localhost:<dynamic port>`.

## Consequences

### Positive

- `pnpm test:int` works identically for all future phases with no shared
  state and full teardown.
- Unit CI legs stay Docker-free and fast; runtime failures are separate.
- The preflight gives actionable, near-instant diagnostics on Windows.

### Negative

- Windows developers must export `DOCKER_HOST` per shell (documented; env:check keeps reminding them).
- The integration job alone pays the Docker startup cost, and its runtime (~1 min) is dominated by container boot.

### Follow-up

- If a later phase adds more engines (RabbitMQ, Redis), extend
  `packages/testing` the same way rather than configuring e2e containers ad
  hoc.
- Revisit CI job parallelism if container image pulls become the bottleneck
  (e.g. `docker buildx` cache or GHCR mirror).

## Alternatives considered

- Running integration tests against the compose database: rejected - tests
  then share mutable state and lose database-per-file isolation.
- `TESTCONTAINERS_RYUK_DISABLED=true`: not needed; would leave containers
  behind depending on manual teardown correctness.
- Docker Desktop or docker-in-docker inside Windows: forbidden by project
  policy.

## References

- ADR 0004 (dev environment; closes its TCP follow-up), ADR 0005
  (dependency rules; `packages/testing` may import only `@rvu/shared-kernel`
  among workspace code), the P2 phase prompt (Stage A).
