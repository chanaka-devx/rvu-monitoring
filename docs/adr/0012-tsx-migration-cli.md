# ADR 0012: tsx runs the migration CLI

- Status: Accepted
- Date: 2026-10-23
- Owners: RVU Monitoring team
- Phase: P2 (Stage B)

## Context

`db:migrate` must run the TypeScript migration runner
(`packages/platform/src/migrate.ts`) directly, with no build step, on Windows
and Linux from `node tools/migrate.mjs` (AGENTS.md hard rule: root scripts are
cross-platform Node scripts).

## Decision

The migration CLI entry point lives inside `packages/platform`
(`src/migrate.ts`) and is executed with Node's
`node --import tsx <entry>` so TypeScript workspace sources resolve and run
without a prebuild, via `tsx` (a root devDependency, pinned by pnpm).

`tools/migrate.mjs` additionally:

- parses `.env` with `util.parseEnv`, letting process env win;
- composes `DATABASE_URL` from the local compose variables
  (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DB_PORT`) when
  `DATABASE_URL` is absent, and defaults `APP_DATABASE_URL` to the same URL
  (Phase 2 has no separate restricted role yet; Stage D will supply one);
- prints the target with `redactUrl` (password masked) and returns non-zero on
  failure.

## Consequences

- `pnpm db:migrate` works on Windows and Linux without Docker on the Node side
  (only the Postgres port matters).
- The runner acquires the global advisory lock (key 70011001), applies
  pending sources from `packages/platform/migrations` and
  `modules/*/infrastructure/migrations`, and records them in
  `platform.schema_migrations` (checksum sha256 with LF normalization,
  tampering, duplicate and gap detection).
