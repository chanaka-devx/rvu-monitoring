# ADR 0001: Modular monolith

- Status: Accepted
- Date: 2026-10-22
- Owners: RVU Monitoring team
- Phase: P00

## Context

RVU Monitoring starts as a single deployable application. The domain is expected
to grow across billing, provider directories, contracts, imports and reporting.
Independent services would add operational cost and distributed-transaction
complexity before the domain boundaries are proven.

At the same time, a conventional layered monolith allows the domain to become
entangled with NestJS, persistence libraries and other modules. That would make
later extraction or replacement of a module expensive.

## Decision

Use a modular monolith with explicit module boundaries:

- Every business capability lives under `modules/<name>/`.
- Each module has `domain/`, `application/`, `infrastructure/` and `interface/`.
- Other modules may import a module only through its `public-api.ts`.
- `apps/api` is the composition root. It wires modules together and owns process
  concerns such as HTTP bootstrap and lifecycle.
- `packages/shared-kernel`, `packages/contracts` and `packages/testing` contain
  cross-module primitives, public contracts and test support.
- Boundaries are executable rules enforced by dependency-cruiser and
  architecture tests, not just conventions.

The P0 template deliberately contains no business logic. The module generator
provides the same structure for every new module.

## Consequences

### Positive

- A single deployment and database keep development and operations simple.
- Module internals can change without breaking other modules.
- Boundaries are checked in CI on Windows and Linux.
- Modules can be extracted later if scale or team structure requires it.

### Negative

- The process remains one deployable unit; a module cannot be scaled
  independently.
- Developers must maintain `public-api.ts` files and keep domain code free of
  infrastructure concerns.
- The boundary rules add a small amount of build tooling and test time.

### Follow-up

- The composition root needs a deliberate exception to the current P0 rule that
  bans `apps/*` from importing `modules/*` and `packages/*`. This conflict is
  recorded in the P00 handoff and must be resolved before modules are wired into
  `AppModule`.

## Alternatives considered

- Microservices from day one. Rejected because the domain boundaries are not yet
  proven and operational complexity would dominate delivery.
- A traditional layered monolith without module boundaries. Rejected because it
  allows dependency drift and makes domain isolation untestable.
