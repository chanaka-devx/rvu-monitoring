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
  - Files use LF line endings (.gitattributes enforces this).
  - Compose files must not bind-mount repo folders. Use named volumes.
  - Windows path conventions in docs: use `curl.exe`, not `curl`.
  - Everything must also pass on Linux, since CI runs on ubuntu and windows.
- The database port comes from DB_PORT (default 5432).

## Commands (every phase must keep these working)
pnpm install        install
pnpm env:check      verify the local environment (Windows toolchain + WSL Docker)
pnpm typecheck      tsc across workspace
pnpm lint           eslint
pnpm arch           dependency-cruiser boundary check
pnpm test           unit tests
pnpm test:int       integration tests (Testcontainers via DOCKER_HOST)
pnpm verify         typecheck + lint + arch + test (+ test:int when present)
pnpm db:up          start Postgres (waits until healthy)
pnpm db:down        stop Postgres
pnpm db:ps          show container status
pnpm db:check       confirm localhost:DB_PORT is reachable from Windows