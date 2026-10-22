# RVU Monitoring

RVU Monitoring is a modular monolith. Business capabilities live under
`modules/`, the NestJS application under `apps/api`, and cross-module building
blocks under `packages/`.

P0 provides the repository, executable guardrails, module template and local
Postgres setup. No business or domain code is implemented yet.

## Windows quickstart

The supported development host is Windows with Node.js 22, pnpm and Docker
Engine inside WSL2 Ubuntu. Do not use Docker Desktop and do not place the
repository inside OneDrive.

### 1. Install the host toolchain

1. Install Node.js 22 (or run `nvm use` with the version in `.nvmrc`).
2. Install the pinned package manager:

   ```powershell
   npm install -g pnpm@10.34.7
   ```

3. Verify:

   ```powershell
   node -v
   pnpm -v
   ```

### 2. Set up Docker Engine in WSL2

1. Install WSL2 and Ubuntu:

   ```powershell
   wsl --install -d Ubuntu
   ```

2. Inside Ubuntu, install Docker Engine and the Compose plugin from Docker's
   official Ubuntu instructions. Do not install Docker Desktop.
3. Add your WSL user to the `docker` group, then restart the WSL terminal:

   ```bash
   sudo usermod -aG docker "$USER"
   ```

4. Verify from Windows:

   ```powershell
   wsl docker info --format "{{.OperatingSystem}}"
   wsl docker compose version
   ```

5. From phase P2, Testcontainers needs the Docker API exposed on
   `tcp://localhost:2375`. Configure the WSL Docker daemon to listen on
   `tcp://0.0.0.0:2375` and set:

   ```powershell
   $env:DOCKER_HOST = "tcp://localhost:2375"
   ```

### 3. Install and check the repository

Run from a short local path such as `C:\dev\rvu-monitoring`:

```powershell
pnpm install
pnpm env:check
```

`pnpm env:check` checks Node 22, pnpm, the OneDrive path rule and the WSL2
Docker setup.

### 4. Start Postgres and verify

```powershell
Copy-Item .env.example .env
pnpm db:up
pnpm db:ps
pnpm db:check
pnpm verify
```

`db:up` waits for the healthcheck. The database port comes from `DB_PORT`
(default `5432`).

### 5. Run the API

```powershell
pnpm dev:api
```

In another terminal:

```powershell
curl.exe http://localhost:3000/api/v1/health/live
curl.exe http://localhost:3000/api/v1/health/ready
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install the workspace |
| `pnpm env:check` | Check the Windows/WSL toolchain |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm lint` | ESLint flat config |
| `pnpm arch` | dependency-cruiser boundary check |
| `pnpm test` | Unit and architecture tests |
| `pnpm test:int` | Integration tests (skips when none exist) |
| `pnpm verify` | typecheck + lint + arch + test + test:int |
| `pnpm db:up` | Start Postgres and wait for healthy |
| `pnpm db:down` | Stop Postgres |
| `pnpm db:ps` | Show container status |
| `pnpm db:check` | TCP check of `localhost:${DB_PORT}` |
| `pnpm gen:module <name>` | Generate `modules/<name>` |
| `pnpm dev:api` | Run the NestJS API with watch |

## Repository layout

```text
apps/
  api/                 NestJS composition root and health endpoints
  web/                 Placeholder until P14
packages/
  shared-kernel/       Cross-module primitives
  contracts/           Versioned cross-module contracts
  testing/             Shared test support
modules/               Business modules (generated in P0, implemented later)
tools/                 Cross-platform Node scripts
tests/architecture/    Fixtures and architecture-as-tests
docs/adr/              Architecture decision records
docs/phases/           Phase handoffs
```

## Module rules

- `domain/` is framework-free: no NestJS, ORM/database package, `node:fs`,
  `node:net` or another module.
- `application/` may import only its own `domain/` and `application/` code plus
  `packages/shared-kernel`.
- Other modules are imported only through `modules/<name>/public-api.ts`.
- `apps/*` is the composition root: it may import a module only through
  `public-api.ts` or `<name>.module.ts`, and a package only through its entry
  point. Modules and packages never import `apps/*`.
- `packages/shared-kernel` imports no other workspace code; `packages/testing`
  and `packages/contracts` may import only `packages/shared-kernel`.
- `domain/` and `application/` must not import `packages/contracts`. Define a
  port and implement it in `infrastructure/`.
- Domain and application code is deterministic: no `Date.now()`, zero-argument
  `new Date()`, `Math.random`, `parseFloat` or `Number.parseFloat`. Use the
  `Clock` port, the `IdGenerator` port and `DecimalValue`.
- Circular dependencies are forbidden.
- Under `modules/`, default exports and explicit `any` are forbidden.

Generate a new module with:

```powershell
pnpm gen:module billing
```

The generator creates the four layers, `public-api.ts`, the
`<name>.module.ts` NestJS wiring file, a README and a passing sample test. Run
`pnpm install` once after generating a module so the workspace links its
`@nestjs/common` dependency.

## CI

GitHub Actions runs typecheck, lint, architecture and unit tests on
`ubuntu-latest` and `windows-latest`. Docker and the environment check are not
run in CI.
