# P00 handoff: repository, guardrails and module template

- Date: 2026-10-22
- Status: complete, with recorded gaps below

## What was built

- pnpm workspace with `apps/*`, `packages/*` and `modules/*`, pinned to
  `pnpm@10.34.7` and Node 22.
- Strict TypeScript baseline with `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`.
- Minimal NestJS API with `GET /api/v1/health/live` and
  `GET /api/v1/health/ready`.
- Empty `@rvu/shared-kernel`, `@rvu/contracts` and `@rvu/testing` packages that
  build and typecheck.
- Vitest 3 + unplugin-swc unit test project.
- ESLint 9 flat config: bans explicit `any`, default exports under `modules/`.
- dependency-cruiser rules and architecture tests for:
  - domain isolation from NestJS, ORM/DB packages, `node:fs`, `node:net` and
    other modules;
  - application imports limited to its own application/domain and shared kernel;
  - cross-module imports only through `public-api.ts`;
  - apps not importing modules/packages;
  - no circular dependencies.
- `pnpm gen:module <name>` generator with LF-only output, module layers,
  `public-api.ts`, README and a passing sample test.
- Postgres 16 Compose service with healthcheck, named volume, configurable
  `DB_PORT` and no bind mounts.
- Cross-platform `tools/db.mjs`, `tools/doctor.mjs`, `tools/arch.mjs`,
  `tools/verify.mjs` and `tools/test-int.mjs`.
- GitHub Actions CI matrix for `ubuntu-latest` and `windows-latest`.
- ADRs 0000-0004 and the Windows quickstart README.

## Repository layout

```text
apps/api                        NestJS composition root + health endpoints
apps/web                        README placeholder for P14
packages/shared-kernel          empty, buildable
packages/contracts              empty, buildable
packages/testing                empty, buildable
modules/                        generator output only in P0 (sample removed)
tools/                          Node scripts for DB, doctor, arch, verify, gen
tests/architecture/fixtures/    one fixture per forbidden dependency
docs/adr/                       ADR template and P0 decisions
docs/phases/P00-handoff.md      this file
.github/workflows/ci.yml        Windows + Linux verification
```

## Verified commands

All of the following were run on the developer Windows machine:

```powershell
pnpm install --frozen-lockfile
pnpm verify
pnpm build
pnpm run doctor
pnpm db:up
pnpm db:ps
pnpm db:check
pnpm gen:module sample
pnpm typecheck
pnpm lint
pnpm arch
pnpm test -- modules/sample/index.test.ts
```

Evidence:

- `pnpm verify`: typecheck, lint, arch, 30 unit/architecture tests and
  `test:int` skip all passed.
- `pnpm arch`: no violations.
- Deliberately illegal fixture: dependency-cruiser exits non-zero and the
  architecture test asserts it.
- `pnpm gen:module sample`: generated module passed typecheck, lint, arch and
  both sample tests. The generated `modules/sample` directory was then removed
  so the gate command can be run again from scratch.
- `pnpm db:up`: Postgres 16 became healthy. `pnpm db:ps` showed
  `Up ... (healthy)`. `pnpm db:check` connected to `localhost:5432`.
- Built API and `curl.exe` returned `200` for both health endpoints.
- Postgres was left running after verification. Stop it with `pnpm db:down`.

## Decisions

- Module boundaries are generated per module at dependency-cruiser config load
  time. This allows an exact "only through `public-api.ts`" rule without
  cross-backreferences in regular expressions.
- Dependency patterns are `/`-terminated prefix patterns. dependency-cruiser's
  safe-regex rejects `.*` inside optional groups.
- `db:check` reads `.env` with Node's `util.parseEnv`, with process environment
  taking precedence.
- `test:int` exits 0 with a skip message when no `*.int.test.ts` files exist.
- CI deliberately does not run `doctor`, Docker or integration tests.

## Recorded contradictions and known gaps

1. **Plan documents are empty.** `docs/plan/implementation-plan.md` and
   `docs/plan/architecture.md` contain no content. P0 was implemented from the
   phase brief. Future phases need those documents populated.
2. **`pnpm doctor` is shadowed by pnpm.** pnpm 10 has a built-in
   `pnpm doctor` command, so the repository script is only reachable as
   `pnpm run doctor`. The literal gate command exits 0 but does not run our
   checks. README and this handoff use `pnpm run doctor`.
3. **App import rule conflicts with the composition root.** Rule 7d forbids
   `apps/*` from importing `modules/*` and `packages/*`. That is implemented
   literally, so `AppModule` currently wires only the health controller. Before
   business modules are composed, the rule must be relaxed to allow apps to
   import module `public-api.ts` files and explicit packages.
4. **Application layer cannot import contracts.** Rule 7b allows only its own
   domain/application and `shared-kernel`. If application use cases need
   `packages/contracts`, the rule needs an intentional amendment.
5. **No data-access library.** Deferred to P2 as required. No ORM, migration or
   repository dependency exists yet.
6. **Remote CI not executed.** The workflow is committed but has not run on
   GitHub until the branch is pushed/opened as a PR. Local Windows commands pass;
   Linux parity is covered by cross-platform Node scripts and the CI matrix.
7. **`DOCKER_HOST` is not set locally.** Doctor warns, does not fail. Set
   `DOCKER_HOST=tcp://localhost:2375` before Testcontainers work in P2.
8. **Architecture tests are process-heavy.** Each fixture spawns
   dependency-cruiser; the suite takes roughly 20-25 seconds. It can be
   optimized later with the programmatic API if needed.
9. **No commit was created.** All files are uncommitted; the developer should
   review and commit when ready.
