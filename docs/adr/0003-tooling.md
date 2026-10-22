# ADR 0003: Tooling baseline

- Status: Accepted
- Date: 2026-10-22
- Owners: RVU Monitoring team
- Phase: P00

## Context

The project runs on Windows and Linux and must provide one reliable command set
for local development and CI. NestJS relies on decorators, the repository is a
pnpm workspace, and architecture rules must be executable rather than
documentation-only.

## Decision

Use the following baseline:

- **pnpm 10.34.7** with `pnpm-workspace.yaml`. The exact version is pinned in
  `packageManager`. The workspace contains `apps/*`, `packages/*` and
  `modules/*`.
- **Turborepo** for `typecheck` and `build` orchestration and caching.
- **TypeScript 5.9** with `strict`, `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`.
- **Vitest 3 with unplugin-swc** for tests. SWC is required because NestJS
  decorators need metadata and SWC is reliable across Windows and Linux.
- **ESLint 9 flat config** with typescript-eslint. `any` is banned everywhere and
  default exports are banned under `modules/`.
- **dependency-cruiser 18** for module boundaries, circular dependencies and
  architecture-as-tests fixtures.
- **Node scripts** under `tools/` for database, environment check, verify and
  architecture commands. Package scripts do not contain shell-specific syntax.

The data-access library (ORM/query builder/migrations) is explicitly deferred to
P2. No data-access dependency is introduced in P0.

## Consequences

### Positive

- One lockfile and one install command across the workspace.
- Fast cached typecheck/build tasks.
- Decorator-heavy NestJS tests work without a separate transformer.
- Architecture violations fail CI on both operating systems.

### Negative

- The repository environment check is invoked as `pnpm env:check`, so it is not
  confused with pnpm's built-in `pnpm doctor` command.
- SWC and Vitest add native dependencies and a larger install footprint.
- dependency-cruiser's JavaScript configuration must avoid functions in the
  exported object because the configuration is cloned.
- Dependency-cruiser safe-regex rejects `.*` inside optional groups, so
  boundary patterns use `/`-terminated prefixes instead of greedy wildcards.

### Follow-up

- Choose the data-access and migration library in P2.
- Revisit ESLint type-aware rules once the application code grows.
- Add integration test orchestration when Testcontainers arrives in P2.

## Alternatives considered

- npm or Yarn workspaces. Rejected because pnpm has the best workspace
  linking/caching story for this layout and is already standard for the project.
- Jest with ts-jest. Rejected because SWC-backed Vitest is faster and avoids
  common Windows decorator metadata issues.
- Nx. Rejected as heavier than needed for a small modular monolith.
