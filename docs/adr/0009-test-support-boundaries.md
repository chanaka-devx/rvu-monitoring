# ADR 0009: Test-support code boundaries

- Status: Accepted
- Date: 2026-10-22
- Owners: RVU Monitoring team
- Phase: P1c

## Context

Phase P1b built `packages/testing` and shipped its contents to workspace code:
the `Clock`/`IdGenerator` fakes (`FixedClock`, `SequentialIdGenerator`), seeded
random, synthetic data builders and CSV writer, the brief-scenario fixture and
fast-check arbitraries. Test tooling (`vitest`, `fast-check`, `testcontainers`,
`@testcontainers/*`) is installed at the workspace root. Nothing prevented
production code from importing any of it.

That matters more than normal: a `FixedClock` or `SequentialIdGenerator`
entering production code replaces real time and identity with fake values, and
synthetic data entering production is a PHI-discipline failure by definition.
Relying on code review alone does not meet the project's rule that gates be
machine-checkable (implementation plan, section 1).

## Decision

### Definition of a test file

A **test file** is any file of which the name matches `*.test.ts`,
`*.test.mjs` or `*.int.test.ts`, or any file located under `tests/`.
Everything under `apps/`, `modules/` and `packages/` that is not a test file by
this definition is **production code**.

`packages/testing` itself is exempt from the second rule as the *provider* of
test tooling: it has to import `fast-check` to offer arbitraries, and its files
import each other. Its runtime exports (`FixedClock`, builders, ...) remain
test-only by the first rule.

### Rules (dependency-cruiser, severity error)

1. `testing-package-only-from-tests` — a production file under `apps/`,
   `modules/` or `packages/` (except `packages/testing`) must not import the
   testing package, whether through the package name (`@rvu/testing`), a
   workspace path (`packages/testing/...`) or a `node_modules` path. Matches
   both unresolved package-name edges and edges resolved through the pnpm
   junction (`packages/testing/src/index.ts` realpath, or
   `node_modules/@rvu/testing/...` when symlinks are not followed).
2. `test-tooling-only-from-tests` — a file matching the same `from` scope must
   not import `vitest`, `fast-check`, `testcontainers` or `@testcontainers/*`.

### Dependency types: why the rule matches package names explicitly

The preferred mechanism, `to.dependencyTypes: ['npm-dev']`, was probed and
rejected. dependency-cruiser classifies the dependency type against the
nearest `package.json` of the *importing* file:

- a production file inside a package/module manifest that does not declare the
  tooling classifies as `npm-no-pkg` — production manifests do not declare
  vitest/fast-check, so the violations that matter would not be classified
  `npm-dev`;
- the same import from the fixture tree, whose nearest manifest is the
  repository root package.json (declares vitest as a devDependency),
  classifies as `npm-dev`.

Classification therefore reflects which manifest declares the library, not
"test tooling", and is too unreliable to enforce the rule. Both rules match
explicit package/name path patterns instead; they work for unresolved edges
(bare package name, as produced by the fixture cruises) and resolved edges
(pnpm-realpath forms such as
`node_modules/.pnpm/.../node_modules/vitest/dist/...`).

### Report visibility of resolved node_modules edges

Relatedly, the previous `options.exclude` regex (`node_modules|dist|coverage|
.turbo`) dropped *all* resolved node_modules dependencies from the report in
every cruise mode, so any node-matching `to` pattern could never fire for an
installed package. The exclude regex now carries a negative lookahead so the
four test-tooling packages remain visible (with or without the `.pnpm/`
indirection), while `dist/`, `coverage/` and `.turbo/` exclusions are
unchanged. `doNotFollow: node_modules` is untouched: resolved tooling
dependencies are reported but not followed, endpoint deps stay un-cruised, and
the cruise time is unchanged.

## Consequences

### Positive

- Test helpers, synthetic data and fake clocks cannot enter production code.
- Test tooling cannot be imported from production code, keeping the runtime
  dependency surface clean for bundling and audits.
- Every rule has one violating fixture and passing edges in the clean fixture
  (a module `*.test.ts` importing `@rvu/testing` and vitest, a `tests/` file
  importing `packages/testing` by relative path, and `packages/testing`
  importing fast-check as provider).
- The report now exposes direct npm endpoints, so future `to` rules can
  reference real installed package paths instead of only unresolved names.

### Negative

- The arch report grew from 54 modules / 83 dependencies to 60 modules / 118
  dependencies because previously suppressed node_modules endpoints are now
  visible. They are not followed (no cruise-time cost).
- The exclude regex encodes the four tooling names; a new test-only tooling
  package (for example Playwright) will need the additional alternative.

### Follow-ups

- Add future test tooling names (Playwright, storybook, ...) to the exclude
  lookahead and the rule pattern when they arrive (P14+).
- Revisit exclude granularity after P2 if the visible-endpoint count grows
  sharply with production dependencies (tracked in backlog).

## Alternatives considered

- **`to.dependencyTypes: ['npm-dev']`.** Rejected: per-importing-manifest
  classification misses exactly the production imports the rule exists for
  (`npm-no-pkg`); see above.
- **ESLint `no-restricted-imports`.** Rejected: it only sees literal specifiers
  per file, misses path-shape matching against resolved workspace paths,
  applies per glob rather than against the dependency graph, and the project
  already has the dependency-cruiser enforcement channel for boundaries.
- **Do nothing.** Rejected: regulatory and PHI posture require synthetic/test
  code to stay out of the product, and gates must be machine-checkable.

## References

- ADR 0005: Layer and package dependency rules.
- ADR 0008: Synthetic data.
- `docs/phases/P01c-handoff.md` (verification evidence).
- `docs/plan/architecture.md`, section 3 (enforced rules).
