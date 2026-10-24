# P07 handoff: crediting core (pure domain)

## Shipped
- `modules/crediting/domain/` (pure domain, no I/O): `service-line-version.ts`
  (LineStatus, ProviderId, ServiceLineVersion), `rvu-schedule-view.ts`
  (`workRvuFor` → value / `no_value` / `unknown_code`), `modifier-rules.ts`
  (normalize + resolve, outcome union), `crediting-policy.ts`
  (create/fromJson/toCanonical/equals, error `crediting/policy-invalid` with
  `details.problems`), `credit-decision.ts` (decision union + trace +
  `decisionToJson`), `credit-calculator.ts` (`decideCredit`, `CreditCalculator`),
  `schedule-selection.ts` (`selectScheduleBasis`, `creditDateOf`),
  `correction-period.ts` (`assignCorrectionPeriod` with `isClosed` boolean
  input until the reporting phase provides the port), `default-policy.ts`,
  `domain/index.ts` (public API + preserved `CreditingDomainMarker`).
- Tests: golden/status/units/schedule/dates/modifiers/corrections plus
  fast-check properties (7 properties, 500 runs each).
- Docs: ADR `docs/adr/0016-crediting-pure-domain.md`,
  `docs/plan/policy-defaults.md`, two backlog entries.
- Tooling (item 13): root `stryker.config.json` + `@stryker-mutator/core` and
  `@stryker-mutator/vitest-runner` devDeps + `pnpm mutation:crediting` script.

## Gates
- `pnpm verify:fast`: all green (typecheck, lint, arch, 443 tests).
- Mutation (Stryker 9.6.1, vitest runner, per-test coverage): total 88.32%,
  `credit-calculator.ts` 92.24%, `modifier-rules.ts` 85.44% (covered basis
  91.32%/92.24%/90.60% — both files meet the ≥85% target). 23 survivors remain
  (mostly detail-string literals and rounding-mode-string equivalences); full
  list in `reports/mutation/mutation.html` (gitignored).
- Run via `pnpm mutation:crediting`. Stryker needs `plugins:
  ["@stryker-mutator/vitest-runner"]` in pnpm's isolated layout, and its
  sandbox dir is gitignored.

## Out-of-scope work (owner-authorized)
The merge aedd404 (PR #3) had dropped `pg`, `testcontainers`,
`@testcontainers/postgresql` from `packages/testing/package.json`, breaking
`pnpm test` before any P07 change. Repair authorized in this phase (precedent
P02f): the three deps restored, `pnpm install` re-linked them; the affected
tests pass again.

## Plan deviations
- `modules/crediting/package.json` declares `@rvu/shared-kernel:
  workspace:*` as a runtime dependency (typecheck cannot resolve it by
  directory walk-up otherwise).
- ADR number is 0016, not 0017 (stale note; the free slot was 0016).
- `decisionToJson` added as a canonical serializer for decisions (used by
  property tests and later phases; architecture's `Decimal` fields map to
  DecimalValue strings).
- Exclusion review order: unsupported modifiers first, then exclusions
  (first sorted excluded modifier), then ambiguous multipliers (two distinct
  multiplier rules never silently compose, even with equal factors).
- P03 property interpretation: only non-empty modifier sets disjoint from
  policy rules are asserted never-Credited (the empty set is the standard
  credit path by design).

## Skills used / declined
- Used: typescript-pro, ddd-tactical-patterns, domain-driven-design (plus the
  TDD baseline). Declined: database/postgres/docker/api skills — this phase
  has no database, Docker, or HTTP surfaces, and the kernel/next phase decides
  storage; adding their guidance now would be speculative.
