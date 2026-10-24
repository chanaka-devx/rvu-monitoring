# P1c handoff: test-support boundary rule

- Date: 2026-10-22
- Status: complete, with recorded gaps below
- Previous phase: `docs/phases/P01b-handoff.md`
- Branch: `p1b-test-foundation` (P01b changes still uncommitted in the tree; see inventory)

## What was built

Two dependency-cruiser rules that make test-support code unreachable from
production, plus the manifest change that stops `fast-check` being a
dev-only dependency of `@rvu/testing`, plus ADR 0009.

- `.dependency-cruiser.cjs`:
  - Rule `testing-package-only-from-tests`: production files under
    `apps/`, `modules/`, `packages/` (excluding `packages/testing`, the
    provider) must not import `@rvu/testing` - by package name, by workspace
    path (`packages/testing/...`) or through `node_modules`. Files inside
    `packages/testing` may import each other.
  - Rule `test-tooling-only-from-tests`: the same `from` scope must not
    import `vitest`, `fast-check`, `testcontainers` or `@testcontainers/*`.
  - `options.exclude.path` rewritten as a single regex with a negative
    lookahead that keeps the four tooling packages visible in the report;
    `dist/`, `coverage/`, `.turbo/` exclusions unchanged and `doNotFollow`
    untouched (see "Resolution" for why the exclude change was required).
  - No comments added; rule intent lives in the rules' existing `comment`
    fields, the fixtures, the tests and ADR 0009.
- `packages/testing/package.json`: `fast-check ^4.0.0` moved from
  devDependencies to dependencies (same range as
  `packages/shared-kernel/package.json`). No source file changed.
- Fixtures (TDD, fixtures + tests written and watched RED before the rules
  existed):
  - `tests/architecture/fixtures/testing-package-in-production/`:
    `apps/api/src/bad-name.ts` imports `@rvu/testing` by package name,
    `apps/api/src/bad-path.ts` by relative path; minimal
    `packages/testing` package for resolution shape.
  - `tests/architecture/fixtures/test-tooling-in-production/`:
    `modules/sample/domain/bad.ts` (production-style domain file) imports
    `vitest`, `fast-check`, `testcontainers` and `@testcontainers/mysql`.
  - Passing edges extended inside the existing `clean` fixture only (to keep
    the cruise count at +2): `modules/beta/domain/beta.test.ts` imports
    `@rvu/testing` + vitest; `tests/harness/test-support.ts` imports
    `packages/testing` by relative path; `packages/testing/src/index.ts`
    imports `fast-check` as provider.
- `tests/architecture/arch.test.mjs`: three new tests - both rule violations
  (asserted via `violationFromPaths`, deduplicated per file) and a test that
  the clean fixture actually exercises the allowed edges (so the exemption
  cannot be accidentally vacuous).

## Rule-to-fixture map

| Rule | Violating fixture | Passing edge |
| --- | --- | --- |
| `testing-package-only-from-tests` (package name) | `testing-package-in-production` (`apps/api/src/bad-name.ts`) | `clean` (`modules/beta/domain/beta.test.ts`, `tests/harness/test-support.ts`) |
| `testing-package-only-from-tests` (relative path) | `testing-package-in-production` (`apps/api/src/bad-path.ts`) | `clean` (`tests/harness/test-support.ts`) |
| `test-tooling-only-from-tests` | `test-tooling-in-production` (`modules/sample/domain/bad.ts`, 4 edges) | `clean` (`modules/beta/domain/beta.test.ts` imports vitest; `packages/testing/src/index.ts` imports fast-check under the provider exemption) |

## Resolution approach (recorded per the ADR requirement)

The prompt preferred `to.dependencyTypes: ['npm-dev']` "if it resolves per
package in this workspace; otherwise match the package names explicitly".
Probed and rejected; explicit package-name matching is what ships:

- dependency-cruiser classifies a dependency by the nearest `package.json` of
  the **importing file**. A production file inside `modules/<m>` (manifest
  does not declare vitest) imports as `npm-no-pkg`; the identical import whose
  nearest manifest is the repo root (`vitest` in devDependencies) imports as
  `npm-dev`. So `npm-dev` would miss exactly the production imports the rule
  exists for, and silently depends on which manifest sits nearest the file.
- Full evidence is in ADR 0009; the failing probe shapes were re-checked
  against all three cruise modes used in this repo (`.` fixtures, target dirs,
  single-file).

The exclude rewrite was equally forced: with the previous exclude, resolved
node_modules edges (pnpm realpath `node_modules/.pnpm/.../node_modules/<pkg>/...`)
were dropped from the report in *every* cruise mode, so no `to` pattern could
fire for an installed package (the `(^|/)node_modules/<name>` alternatives in
the existing banned-domain rules were dead in practice for resolved deps).
The lookahead keeps the four tooling names visible; everything else is
excluded exactly as before, and `doNotFollow: node_modules` still prevents
following into them (endpoints are reported unfollowed; cruise time
unchanged). One empirical oddity recorded honestly: in fixture cruises
(`.` mode) resolution walks up into the repo `node_modules`, so a fixture file
importing an installed package may come back with a resolved pnpm path rather
than the bare name. The rule patterns accept both shapes, and the clean-edge
test matches either, so fixtures stay portable to machines with a full
install (CI) and machines without (a fresh fixture copy).

## Rule semantics (exact)

- Test file = name matching `*.test.ts`, `*.test.mjs` or `*.int.test.ts`, or
  any file under `tests/` (enforced via
  `from.pathNot = (?:\.(?:int\.)?test\.(?:ts|mjs)$|^packages/testing/)`; the
  `tests/` half is implicit because `from.path` only matches
  `apps|modules|packages`).
- `packages/testing` is exempt from both rules as provider (it imports
  `fast-check` for arbitraries; it never imports the tooling internally
  otherwise).
- No other behavior changed: substrate rules, lint determinism, generator
  output untouched.

## Verified commands (Windows, PowerShell)

```powershell
pnpm install
pnpm typecheck    # 4 packages successful (5 with the generated sample)
pnpm lint         # clean
pnpm arch         # no dependency violations found (60 modules, 118 dependencies)
pnpm test         # 29 files passed (timing below)
pnpm verify       # typecheck + lint + arch + test + test:int skip all passed
```

- `pnpm test`: `Test Files 29 passed (29)`, wall 35.01 s. Same file count as
  the P01b handoff reported (29), now with 3 more arch tests.
- `pnpm verify`: all green, wall 48.3 s.
- Real-repo check the prompt's item 5 requires: `pnpm arch` flags nothing;
  additionally cruised `tests/` with the same read-only config and only the
  by-design `circular` fixture fired - the existing
  `tests/acceptance/brief-scenario.acceptance.test.ts` and every existing
  `*.test.ts` are clean under the new rules. A repo-wide grep confirmed no
  production file imports `@rvu/testing` or the test tooling today (all hits
  are `*.test.ts` or provider files inside `packages/testing`).

## Generator gate (exact commands)

```powershell
pnpm gen:module sample   # 10 files incl. modules/sample/sample.module.ts
pnpm install             # prune/add importer
pnpm typecheck           # 5 packages, green
pnpm lint                # green
pnpm arch                # green (67 modules, 125 dependencies)
Remove-Item -Recurse -Force modules\sample
pnpm install
git diff --stat pnpm-lock.yaml
```

Result: everything green with the sample present (its `index.test.ts` imports
only vitest and is a test file, so the rules do not fire). After removal the
lockfile is byte-identical to the pre-sample state.

## pnpm-lock.yaml evidence

The working tree already carried P01b lockfile micro-drift (uncommitted), so
the diff was measured twice, as in the approved plan:

- vs the pre-phase snapshot (taken before any change in this session):
  exactly the item-3 change - the `fast-check` entry repositioning from
  `devDependencies` to `dependencies` in the `packages/testing` importer
  (pnpm stores sections alphabetically, so it is a 2-line move, not an edit of
  the whole block).
- vs HEAD: `7 insertions` - the same move *plus* the P01b residual importer
  lines (the `@rvu/shared-kernel` workspace link in the
  `packages/testing importer` block, which HEAD's lockfile lacks). That part
  predates this phase and was not touched beyond the fast-check move.

```text
-    devDependencies:
       fast-check:
         specifier: ^4.0.0
+    devDependencies:
       typescript:
```

## Architecture suite runtime (before / after)

- Before (20 tests): `vitest run tests/architecture/arch.test.mjs`
  duration 29.94 s (tests 29.03 s).
- After (23 tests, same cruise count +2 fixtures, clean fixture extended
  instead of adding passing fixtures): 28.43 s (tests 27.59 s). No runtime
  regression; the exclude rewrite did not measurably change cruise time.
- Real-repo `pnpm arch` report grew from 54 modules/83 dependencies (P01b
  handoff) to 60 modules/118 dependencies because previously suppressed
  direct npm endpoints (decimal.js etc.) are now visible. They are not
  followed (`doNotFollow` untouched), so there is no per-cruise cost. This
  is also added to `docs/backlog.md` with a note to re-check in P2.

## Skills used

- Loaded (baseline): `test-driven-development`, `typescript-pro`.
- Loaded (phase): `clean-code`.
- Applied: fixtures/tests written and watched RED (3 failures with the exact
  "rule does not exist" messages) before implementing; minimal
  implementation; intention-revealing fixture names; no comments in source;
  no new abstractions beyond the phase scope.
- Declined guidance: `clean-code`'s "explain yourself in code instead of
  comments" was honored, but the exclude regex is genuinely non-obvious - its
  explanation lives in ADR 0009 and the fixture tests instead of a code
  comment, because AGENTS.md forbids comments unless asked. `typescript-pro`'s
  decorator/metadata guidance again not applicable (no NestJS work here).
- TDD note: the RED run also exposed that the naive clean-edge assertions
  (exact dependency names) depended on node_modules resolution shapes; the
  assertion was tightened during RED to accept both the bare-name and
  pnpm-realpath forms before the rules were implemented, so GREEN is not
  proven against a mis-tuned test.

## Working tree notes (files not created in this phase, left untouched)

- Pre-existing P01b uncommitted changes (still present, uncommitted):
  `docs/backlog.md` (I only appended one entry; the pre-existing content is
  untouched), `packages/shared-kernel/src/decimal-value.test.ts`,
  `packages/testing/src/index.ts`, `vitest.config.ts`, `pnpm-lock.yaml` (see
  evidence above for the share attributable to this phase),
  untracked `docs/adr/0008-synthetic-data.md`, `docs/phases/P01b-handoff.md`,
  all `packages/testing/src/**` untracked files, `tests/acceptance/`.
- An empty `modules/` directory exists (it appeared when the sample module
  was generated; `modules/sample` contents were removed by the generator gate
  and the directory remained). It is empty and untracked; the sample's files
  are all gone (`pnpm arch` reports 60 modules again, matching the final
  state).
- `docs/plan/implementation-plan.md` status table still shows phases through
  P1 as "Next"/"Todo" despite P01b being built (pre-existing since P1a;
  bookkeeping belongs to the owner).

## Recorded contradictions and known gaps

1. **`dependencyTypes: ['npm-dev']` preference does not hold in this
   workspace** (see Resolution). The fallback ("match the package names
   explicitly") was used, and both the ADR and this handoff record which
   approach shipped and why.
2. **The exclude rewrite changes report surface, not enforcement** - 54â†’60
   modules / 83â†’118 dependencies in `pnpm arch` are now-visible endpoints, not
   new cruised subgraphs. Anything that post-processes the arch JSON (nothing
   today) would see the count jump.
3. **Snapshot-based lockfile gate.** The prompt asked for
   `git diff --stat pnpm-lock.yaml` to show only the item-3 change; against
   HEAD it cannot, because P01b left uncommitted lockfile drift. The gate is
   therefore measured against the pre-phase snapshot (exact fast-check move)
   and documented both ways above.
4. **Remote CI has not run.** All fixture cruises ran inside temp fixture
   roots (symlink helper unchanged from P00a: junction on Windows, dir on
   Linux); nothing in the phase is platform-specific. `pnpm env:check` was
   not run this session (not in this phase's gate; Docker untouched -
   `pnpm test:int` remains the skip-wrapper).
5. **Can test files under `apps/modules/packages` still import test tooling?
   Yes.** The rules only ever match `from` paths under `apps/modules/packages`
   with the test-file exemption - e.g. the real
   `apps/api/src/health/health.controller.test.ts` importing vitest stays
   allowed (it exists in the real repo and the arch run is green).
6. **No commit was created.** All changes are uncommitted for review.

## File inventory (9 files, within the ~35 limit)

- Modified: `.dependency-cruiser.cjs`,
  `tests/architecture/arch.test.mjs`,
  `tests/architecture/fixtures/clean/packages/testing/src/index.ts`,
  `packages/testing/package.json`, `pnpm-lock.yaml`,
  `docs/backlog.md` (append-only append).
- New: `tests/architecture/fixtures/testing-package-in-production/**`
  (4 files),
  `tests/architecture/fixtures/test-tooling-in-production/**` (1 file),
  `tests/architecture/fixtures/clean/modules/beta/domain/beta.test.ts`,
  `tests/architecture/fixtures/clean/tests/harness/test-support.ts`,
  `docs/adr/0009-test-support-boundaries.md`, this handoff.
