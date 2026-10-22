# Architecture: RVU Monitoring

Source: docs/brief/rvu-monitoring-brief.pdf. Environment and working rules live in AGENTS.md.

## 1. What this system really is

The brief reads like a dashboard project, but the hard part is an **auditable, versioned, idempotent calculation ledger** with a dashboard on top. Three properties decide whether practices will trust it:

- **Reproducibility.** Any total can be rebuilt from source lines, schedule version, and policy version.
- **Row accountability.** Every input line is credited, excluded with a reason, or queued for review. Nothing silently disappears.
- **Safe corrections.** Re-imports and corrections never double count.

The design is organized around those properties, not around screens.

### Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Modifier and special-case rules | Multiple-procedure reductions, assistant-at-surgery, professional/technical splits, and anesthesia (time-based) don't fit `wRVU x units` | Whitelist of supported code/modifier combinations; everything else goes to review |
| Codes with no work RVU | Some codes have no usable value in the fee schedule | Route to review as "no RVU value", never default to zero |
| CPT licensing | AMA owns CPT descriptions; CMS files carry codes and RVUs | Store codes and values only; check licensing before showing descriptions |
| Policy ambiguity | Service-date vs posting-date credit, and schedule-by-date vs fixed schedule, change every total | Policy is a versioned domain object, so unresolved decisions become configuration |
| PHI exposure | Even "de-identified" exports can still be PHI | Synthetic data first, minimal fields, a PHI-free mode if the practice can export it, BAA plus risk analysis before pilot |
| "Does wRVU even matter here" | The brief flags cash-pay and membership practices | Gate discovery on a named business decision |
| Compensation | A wrong dollar estimate is high-trust damage | Optional module, labeled "estimate", fed only by closed snapshots |

## 2. Domain model (DDD)

**Ubiquitous language:** Service Line, Import Batch, Credit Decision, Credit Entry, Crediting Policy, RVU Schedule, Review Item, Reporting Period, Period Snapshot.

### Subdomains and bounded contexts

| Module | Type | Responsibility |
|---|---|---|
| **Crediting** | **Core** | Pure calculation of credit decisions, the credit ledger, and policy versions |
| **Reporting & Periods** | **Core** | Totals, target progress, projections, period close, snapshots, exports |
| Service Ingestion | Supporting | CSV upload, column mapping, validation, dedupe, line versions, row outcomes |
| Reconciliation | Supporting | Review items, ownership, resolutions, and a trigger to recalculate |
| Reference Data | Supporting | RVU schedule versions with effective dates and source |
| Practice Directory | Supporting | Practice, locations, providers, provider-ID mappings, targets, FTE, leave |
| Identity & Access | Generic | Users, roles, provider-scoped permissions |
| Audit | Generic | Append-only record of who did what, when, and why |
| Compensation (flagged) | Supporting | Agreements and estimates, consuming closed snapshots only |

### Context map

- Ingestion publishes `ServiceLineAccepted`, `ServiceLineCorrected`, and `ServiceLineVoided`. Crediting subscribes.
- Crediting reads Reference Data and Practice Directory through their public query interfaces. An anti-corruption layer (ACL) translates their models into Crediting's own types.
- Crediting publishes `CreditEntryPosted` and `ReviewRequested`. Reporting and Reconciliation subscribe.
- Reconciliation publishes `ResolutionApplied`. Crediting subscribes and recalculates.
- Reporting publishes `PeriodClosed`. Compensation reads only closed snapshots, never live data.

### Key aggregates

- `ImportBatch`: Uploaded -> Mapped -> Previewed -> Committed or Rejected. It holds row outcomes and counts.
- `SourceLine`: identity is `(practiceId, sourceSystem, sourceLineId)`, with immutable `LineVersion`s identified by a content hash.
- `CreditingPolicy` (versioned value object): date basis, schedule basis, attribution rule, recognized statuses, supported modifier rules, and the correction-period rule.
- `CreditLedger`: append-only `CreditEntry` rows of kind Credit, Reversal, or Adjustment. Totals are always a sum over the ledger, never a mutable counter.
- `ReviewItem`: Open -> Assigned -> Resolved(resolution, reason).
- `ReportingPeriod`: Open -> Closed (snapshot) -> Reopened (reason, new snapshot version).

### The calculation core is a pure domain function with no I/O

```ts
type CreditDecision =
  | { kind: 'Credited'; wrvu: Decimal; rule: string }
  | { kind: 'Excluded'; reason: ExclusionReason }
  | { kind: 'NeedsReview'; reason: ReviewReason };

interface CreditCalculator {
  decide(line: ServiceLineVersion, schedule: RvuSchedule, policy: CreditingPolicy): CreditDecision;
}
```

Unsupported combinations return `NeedsReview` rather than an invented value. Use a decimal library and `NUMERIC(12,4)` columns; never floats.

### Correction handling

When a new line version arrives with a different hash, Crediting appends a Reversal for the old entry and a Credit for the new one. The policy decides whether those land in the original period or as an Adjustment in the current one, and the UI shows which. An identical hash is a no-op, which satisfies "importing twice leaves totals unchanged."

## 3. Architecture

**Modular monolith.** One deployable, one Postgres database, one schema per module. Each module exposes a small public API (facade plus events), and nothing else is importable from outside.

**Clean architecture inside each module.** Dependencies point inward only:

```
interface (HTTP, DTOs)  ->  application (use cases, ports)  ->  domain (entities, VOs, events, services)
infrastructure (repos, ORM, CSV, queue) implements application/domain ports
```

### Enforced rules (CI fails if broken)

1. Domain imports nothing from the framework, ORM, I/O, or other modules.
2. No cross-module imports except another module's `public-api.ts`.
3. No cross-schema joins. Cross-module reads go through query interfaces or projections.
4. Cross-module side effects use domain events through a **transactional outbox**, dispatched in-process, with an **inbox** for idempotent consumers.
5. Reads and writes are separated (CQRS-lite): commands load aggregates, while dashboards read from projection tables.

### Dependency rules (as amended in phase P0a, recorded in ADR 0005)

- `apps/*` may import only `modules/<m>/public-api.ts`, `modules/<m>/<m>.module.ts` (the Nest wiring file), and workspace packages through their entry point. Modules and packages never import `apps/*`.
- `modules/*/domain` and `modules/*/application` must not import `packages/contracts`. `interface` and `infrastructure` may.
- The application layer depends on **ports**. When it needs another module, it defines a port, and an adapter in `infrastructure` (the ACL) implements it by importing the other module's `public-api.ts`.
- `packages/shared-kernel` imports no other workspace code. `packages/testing` and `packages/contracts` may import only `shared-kernel`.
- Determinism in domain and application code: no `Date.now()`, zero-argument `new Date()`, `Math.random`, or `parseFloat`. Use the `Clock` port, the `IdGenerator` port, and `DecimalValue`.

Tooling: `dependency-cruiser` plus architecture tests under `tests/architecture/`, run by `pnpm arch`.

## 4. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript (strict) across the stack | One language, shared types, strong DDD tooling |
| Backend | NestJS | Native module system maps to bounded contexts; DI supports ports and adapters |
| Persistence | PostgreSQL 16, schema per module | ACID ledger, row-level security for tenancy, outbox in the same transaction |
| Data access | Drizzle or Kysely with hand-written mappers (decided in P2) | Keeps ORM types out of the domain; avoids leaky entities |
| Validation | Zod | Row validation for imports and API DTOs |
| CSV | `csv-parse` (streaming) | Large files without loading into memory |
| Numbers | `decimal.js` behind `DecimalValue` | Exact arithmetic |
| Jobs | `pg-boss` | Import and recalculation jobs on Postgres, no extra infrastructure |
| Authorization | RBAC plus provider-scope rules (CASL) | Admin does not imply clinical-data access; practitioner sees only their own data |
| Authentication | OIDC provider with MFA (Cognito, Auth0, or Keycloak) | Do not hand-roll auth for PHI-adjacent systems |
| Frontend | Next.js, TanStack Query and Table, shadcn/ui, ECharts | Desktop dashboard with a responsive mobile summary |
| API | REST with OpenAPI, generated client | Contract-first, typed |
| File storage | S3-compatible with encryption and a short retention policy | Uploaded CSVs |
| Infra | Docker; AWS (ECS Fargate, RDS, S3, KMS) | HIPAA-eligible services, BAA available |
| Observability | OpenTelemetry, pino, Sentry | Traceable imports and recalculations |
| Testing | Vitest (with SWC), Testcontainers, fast-check, Playwright | Property tests suit idempotency and ledger invariants |
| Repo/CI | pnpm and Turborepo, GitHub Actions (ubuntu and windows) | Boundary lint and tests on every PR |

## 5. Repository layout

```
apps/
  api/                         # NestJS composition root, wiring only
  web/                         # Next.js (from P14)
packages/
  shared-kernel/               # Decimal, Result, DomainEvent, Clock, ids
  contracts/                   # OpenAPI types, event schemas
  testing/                     # fixed clock, synthetic data, arbitraries
modules/
  crediting/
    domain/                    # CreditingPolicy, CreditCalculator, CreditEntry, events
    application/               # commands, queries, ports
    infrastructure/            # repos, outbox, mappers, ACL adapters
    interface/                 # controllers, DTOs
    crediting.module.ts        # Nest wiring
    public-api.ts
  ingestion/        (same layers)
  reconciliation/
  reference-data/
  practice-directory/
  reporting/
  identity-access/
  audit/
  compensation/                # behind a feature flag
tools/                         # cross-platform Node scripts (db, env check, generator)
tests/
  architecture/                # boundary fixtures and tests
  acceptance/                  # brief scenario (end-to-end enabled in P11)
docs/
  brief/  plan/  adr/  phases/  backlog.md
```

## 6. Decisions to lock first

These change totals and code in phases P7 and P10, so they are confirmed with the practice's billing lead before those phases start. If still open, implement them as policy configuration, not hard-coded behavior.

1. Crediting date basis and schedule basis (service date vs posting date; schedule by service date vs contractually fixed).
2. Whether corrections post to the original period or as adjustments.
3. The initial supported modifier list.
4. Whether the first pilot can use PHI-free exports.
5. Who can close or reopen a period.