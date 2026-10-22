# ADR 0002: Domain events and transactional outbox

- Status: Accepted (direction)
- Date: 2026-10-22
- Owners: RVU Monitoring team
- Phase: P00

## Context

Modules must react to each other's changes without importing each other's
internals. Examples include notifying another module after a contract changes or
publishing an integration event after a successful import. Publishing directly to
a broker inside a database transaction risks losing events when the transaction
rolls back, or publishing events for changes that never commit.

P0 only establishes repository guardrails. No event or outbox code is written in
this phase.

## Decision

Use in-process domain events between modules and a transactional outbox for
integration events.

- A module publishes domain events after its own state transition is accepted.
- Cross-module reactions subscribe through public contracts, never through a
  module's internal services.
- Events that leave the process are persisted in an outbox table in the same
  database transaction as the state change.
- A background dispatcher delivers outbox rows at least once. Consumers must be
  idempotent.
- Event names and payload contracts belong in `packages/contracts`.

The concrete event bus, dispatcher and persistence mechanism are deferred until
the phase that introduces asynchronous integration. The data-access library
choice is also deferred to P2.

## Consequences

### Positive

- State changes and outgoing events cannot diverge silently.
- Retries and delivery failures become observable and replayable.
- Modules remain decoupled through versioned contracts.

### Negative

- Every producer must write state and outbox rows in one transaction.
- Consumers must tolerate duplicate delivery.
- The outbox needs cleanup, monitoring and operational tooling.

### Follow-up

- Define the outbox schema and dispatcher in the integration phase.
- Define idempotency keys and retention policies.
- Add integration tests for rollback and duplicate delivery.

## Alternatives considered

- Direct broker publishing inside a transaction. Rejected because it cannot be
  atomic with the database commit.
- Synchronous cross-module service calls for every reaction. Rejected because it
  couples module availability and increases request latency.
