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
