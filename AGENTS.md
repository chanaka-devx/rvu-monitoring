## Environment
- Development runs on Windows (PowerShell / Windows Terminal). Node 22, pnpm,
  git, the editor and the AI agent all run on Windows.
- The repo lives on a short Windows path (for example C:\dev\rvu-monitoring),
  never inside OneDrive.
- Docker Engine runs ONLY inside WSL2 Ubuntu (not Docker Desktop). Windows
  reaches it two ways:
  1. `wsl docker compose ...` for compose commands (run from the repo folder).
  2. DOCKER_HOST=tcp://localhost:2375 for libraries such as Testcontainers.
- Containers publish ports to localhost; Windows connects to localhost:DB_PORT.
- Hard rules for tooling:
  - All scripts must be cross-platform Node scripts (tools/*.mjs). No bash,
    no PowerShell-only code, no `rm -rf`, `export`, or `$VAR` in package.json.
  - Use node:path and node:os (tmpdir) for paths. Never hard-code separators.
  - Never modify anything under .agents/. Skills are read-only inputs.
  - Files use LF line endings (.gitattributes enforces this).
  - Compose files must not bind-mount repo folders. Use named volumes.
  - Windows path conventions in docs: use `curl.exe`, not `curl`.
  - Everything must also pass on Linux, since CI runs on ubuntu and windows.
  - Never delete, revert, or overwrite a file you did not create in this phase. If the working tree has unexpected changes or untracked files, leave them alone, list them in the handoff, and continue. This applies even to files outside the phase scope.
  - The database port comes from DB_PORT (default 5432).
  - docs/backlog.md (append only) and docs/phases/<phase>-handoff.md are always in scope for every phase, in addition to the paths listed in the prompt.

## Commands (every phase must keep these working)
pnpm install        install
pnpm env:check      verify the local environment (Windows toolchain + WSL Docker)
pnpm typecheck      tsc across workspace
pnpm lint           eslint
pnpm arch           dependency-cruiser boundary check
pnpm test           unit tests
pnpm test:int       integration tests (Testcontainers via DOCKER_HOST)
pnpm verify         typecheck + lint + arch + test + test:int
pnpm verify:fast    typecheck + lint + arch + test (no Docker needed)
pnpm db:up          start Postgres (waits until healthy)
pnpm db:down        stop Postgres
pnpm db:ps          show container status
pnpm db:check       confirm localhost:DB_PORT is reachable from Windows
pnpm db:migrate     run the TS migration runner (schema_migrations bookkeeping)
pnpm db:bootstrap   provision the local restricted runtime database role

## Skills
- Skills live in .agents/skills/<name>/ (read the SKILL.md in each folder).
- Baseline for EVERY phase: test-driven-development, typescript-pro.
- Beyond the baseline, load only the skills named in the phase prompt (at most
  four). Read their SKILL.md before writing the plan. Do not load others.
- In your plan reply, list the skills you loaded. In the handoff note, list the
  skills used and any skill guidance you declined and why.
- Precedence when guidance conflicts: AGENTS.md hard rules > ADRs > the phase
  prompt > skills. Skills advise; they never override.
- Known conflicts to resolve in favour of this project:
  - nestjs-expert, database-design: no framework decorators, ORM entities, or
    DB types in the domain layer. Map in infrastructure.
  - database-design: ids are UUIDv7 from the IdGenerator port, not serial or
    auto-increment. RVU and money-like values are NUMERIC(12,4) with
    DecimalValue, never floats.
  - database-design, postgres-best-practices: one schema per module, no
    cross-schema joins, ledger tables are append-only.
  - docker-expert: Docker Engine runs only inside WSL2. No Docker Desktop, no
    bind mounts of repo folders, compose invoked as `wsl docker compose` from
    Windows.
  - clean-code: do not add abstractions or files beyond the phase scope.
  - api-design: follow docs/plan/api-surface.md (REST under /api/v1, problem+json
    errors, cursor pagination, Idempotency-Key). Record deviations in an ADR.
