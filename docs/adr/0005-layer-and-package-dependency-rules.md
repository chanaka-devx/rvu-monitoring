# ADR 0005: Layer and package dependency rules

- Status: Accepted
- Date: 2026-10-22
- Owners: RVU Monitoring team
- Phase: P0a

## Context

P0 established the modular monolith, the layer folders inside each module, and
the rule that another module may only be imported through its `public-api.ts`.
Those rules were deliberately conservative while no business module existed:

- `apps/*` was forbidden from importing `modules/*` and `packages/*` at all,
  which conflicts with the composition-root role of `apps/api`.
- The application layer could import only its own `domain/` and `application/`
  plus `packages/shared-kernel`, which left no defined path for cross-module
  contracts.
- Packages had no dependency direction of their own.
- Nothing prevented `Date.now()`, `Math.random` or floating-point parsing from
  entering domain or application code, which would make crediting
  non-deterministic and unreproducible.

Phase P0a replaces the placeholder rules with the intended dependency graph and
makes it executable in CI. The rules below are enforced by
dependency-cruiser, ESLint and the architecture tests under
`tests/architecture/`, with one violating and one passing fixture per rule.

## Decision

### Composition root (`apps/*`)

`apps/*` is the composition root. It may import:

- `modules/<m>/public-api.ts`;
- `modules/<m>/<m>.module.ts`, the NestJS wiring file;
- a workspace package through its package entry point, never a deep `src/**`
  path.

Deep imports into a module or package from `apps/*` are violations. Modules and
packages must never import `apps/*`.

### Packages

- `packages/shared-kernel` imports no other workspace code.
- `packages/testing` may import only `packages/shared-kernel`.
- `packages/contracts` may import only `packages/shared-kernel`.

Packages never import `apps/*` and never import `modules/*`.

### Layers

- `modules/<m>/domain` stays framework-free and never imports another module.
- `modules/<m>/application` may import only its own `domain/` and `application/`
  code plus `packages/shared-kernel`.
- `modules/<m>/domain` and `modules/<m>/application` must not import
  `packages/contracts`.
- `modules/<m>/interface` and `modules/<m>/infrastructure` may import
  `packages/contracts`.
- `modules/<m>/<m>.module.ts` is the wiring file. It may import any layer of its
  own module and is excluded from the domain/application restrictions.

The application layer depends on **ports**, not on contracts. When an
application use case needs another module, it defines a port owned by its own
application layer. An adapter in that module's `infrastructure` layer (the
anti-corruption layer, ACL) implements the port by importing the other module's
`public-api.ts` and mapping that module's types into local types. The
application therefore depends only on an interface it controls, while the
knowledge of another module's public API stays in infrastructure.

Contracts (`packages/contracts`) describe integration and transport schemas. If
application code imported them, the schemas would leak into use cases and
couple the business core to transport or event evolution. Keeping contracts at
the interface/infrastructure edge preserves the dependency-inversion direction
`interface/infrastructure -> application -> domain`.

### Determinism

Domain and application source files (excluding `*.test.ts`) must be
deterministic. ESLint bans:

- `Date.now()` and zero-argument `new Date()`: use the `Clock` port;
- `Math.random()`: use the `IdGenerator` port;
- `parseFloat()` and `Number.parseFloat()`: use `Decimal`/`DecimalValue`.

## Consequences

### Positive

- `apps/api` can wire modules without weakening module isolation: only the
  facade and the wiring file cross the boundary.
- Cross-module reads and side effects have one documented path: a port plus an
  ACL adapter that imports the other module's `public-api.ts`.
- Domain and application behavior is reproducible because time, identity and
  numeric parsing are injected.
- Every rule has executable fixtures, so a regression fails CI on Windows and
  Linux.

### Negative

- Each new rule adds one more `dependency-cruiser` process to the architecture
  suite and therefore more test time; this is tracked in the backlog.
- Ports plus ACL adapters add a small amount of mapping code per cross-module
  interaction.
- The wiring file is intentionally allowed to import every layer of its own
  module, so it must stay wiring-only by review and is not a place for business
  logic.

### Follow-up

- Use the dependency-cruiser programmatic API or caching to keep the
  architecture suite fast as rules grow.
- Confirm the rules against the first real cross-module interaction in P10
  (Crediting reading Directory and Reference Data through an ACL).
- Rename `tools/doctor.mjs` to match the `env:check` script (see backlog).

## Alternatives considered

- **Keep `apps/*` forbidden from importing modules/packages.** Rejected: the
  application could not act as the composition root, and the P0 handoff already
  recorded the conflict.
- **Let `apps/*` import any module file.** Rejected: it would dissolve module
  boundaries and make `public-api.ts` meaningless.
- **Let the application layer import `packages/contracts` directly.** Rejected:
  it would couple use cases to transport/event schemas and invert the intended
  dependency direction.
- **Rely on code review for determinism instead of lint.** Rejected:
  non-determinism in crediting is a correctness risk and the project requires
  machine-checkable gates.

## References

- ADR 0001: Modular monolith.
- ADR 0002: Domain events and transactional outbox.
- ADR 0003: Tooling baseline.
- ADR 0004: Development environment.
- `docs/plan/architecture.md`, section 3 (enforced rules).
- `docs/phases/P00-handoff.md` (recorded P0 contradictions).
