# ADR 0009: Resolved imports in architecture fixtures

- Status: Accepted
- Date: 2026-10-23
- Owners: RVU Monitoring team
- Phase: P2 (preflight fix)

## Context

The P2 preflight canary (`modules/canary/domain/bad.ts` importing
`@nestjs/common` and `node:fs`) failed its gate: `pnpm arch` flagged only
`node:fs`.

The reason was that `.dependency-cruiser.cjs` set

```js
exclude: { path: '(^|/)(node_modules|dist|coverage|\\.turbo)/' }
```

`exclude` removes modules from the dependency graph entirely, before rules
are evaluated. A resolvable external import resolves to a path under
`node_modules/` (with pnpm, through `node_modules/.pnpm/...`), so the edge and
node were pruned and no rule could ever match them. All banned-package
patterns in `module-<name>-domain-no-external-frameworks` (for `@nestjs`,
`pg`, `drizzle-orm`, `ioredis`, `knex`, `mongoose`, `typeorm`, ...) were dead
code for any import that actually resolved. Core modules such as `node:fs`
still fired because they resolve to the bare spec (`fs`), not to a
`node_modules/` path.

The existing domain fixtures (`domain-nest`, `domain-orm`) passed their tests
for the wrong reason: inside a fixture directory `@nestjs/common` and `pg` do
not resolve at all, so dependency-cruiser keeps them as unresolvable nodes
whose *unresolved spec* happens to match the rules. They never exercised a
real resolved import.

## Decision

1. `options.exclude.path` drops only build output directories
   (`dist`, `coverage`, `.turbo`). `node_modules` is no longer excluded from
   the graph.
2. Traversal into third-party packages remains prevented by
   `options.doNotFollow: (^|/)node_modules/`: nodes stay in the graph (so
   rules can match them) but their own dependencies are not explored.
3. The fixture convention is: every rule about external imports must be
   exercised against at least one fixture whose import **resolves**, in
   addition to the unresolved-spec case. Resolution is produced by a helper
   (`runDepcruiseWithResolvedExternals`) that copies a fixture into a temp
   root, installs a tracked stub package into a pnpm-style layout
   (`node_modules/.pnpm-stub/...`), and links it through
   `<tempRoot>/node_modules`, mirroring the layout dependency-cruiser sees in
   the real repository. A tracked stub (not a tracked `node_modules` folder)
   is used because `.gitignore` excludes `node_modules/` and a parent
   directory cannot be re-included once excluded.

## Consequences

### Positive

- Banned external imports are caught whether they resolve or not; the P2
  canary now names both violations.
- The graph still stays bounded: `doNotFollow` prevents crawling
  third-party dependency trees, and the prohibition of circulars is
  unaffected because `doNotFollow` nodes expose no dependencies.

### Negative

- One extra cruise (~1-2 s) per resolved-import rule in the architecture
  suite.
- `pnpm arch` reports more graph nodes (all direct external imports of
  workspace files appear as leaves), which does not change any rule outcome
  but makes the JSON output larger.

### Follow-up

- Keep the canary in the P1/P2 gate whenever a new banned package or
  resolved-external rule is added.

## Alternatives considered

- Matching rules against the import spec instead of the resolved path
  (`to.dependencyTypes`, `to.resolved` alternatives): would also work, but the
  resolved-path convention is what the project's rules already use, and the
  fixtures above make it honest.
- Keeping `exclude` and re-spelling all rules to also match unresolved specs:
  rejected because it documents and cements the silent-pruning bug instead of
  removing it.

## References

- ADR 0005 (layer and package dependency rules).
- ADR 0003 (tooling) and ADR 0004 (dev environment), phase P2 prompt items
  A6/B6 that assume these rules work.
