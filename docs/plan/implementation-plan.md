# Implementation Plan: RVU Monitoring

Each phase is sized for one AI agent session. Architecture and domain details are in docs/plan/architecture.md. Planned endpoints are in docs/plan/api-surface.md. Working rules are in AGENTS.md.

## Status

| Phase | Name | Status |
|---|---|---|
| P0 | Repository, guardrails, module template | Built (merge pending) |
| P0a | Guardrail follow-ups | Next |
| P1a | Shared kernel | Next |
| P1b | Test foundation and acceptance scenario | Todo |
| P2 | Platform infrastructure | Todo |
| P3 | Identity and Access | Todo |
| P4 | Audit | Todo |
| P5 | Practice Directory | Todo |
| P6 | Reference Data | Todo |
| P7 | Crediting core (pure domain) | Todo |
| P8 | Ingestion A | Todo |
| P9 | Ingestion B | Todo |
| P10 | Crediting application and ledger | Todo |
| P11 | Reconciliation | Todo |
| P12 | Reporting read models | Todo |
| P13 | Periods, snapshots, export | Todo |
| P14 | Web foundation | Todo |
| P15 | UI: import and exceptions | Todo |
| P16 | UI: dashboards | Todo |
| P17 | UI: targets, periods, audit | Todo |
| P18 | Hardening and acceptance | Todo |
| P19 | Optional modules | Todo |

## 1. What "agent-sized" means

A phase fits one agent session if it meets all of these:

- **One module, two at most.** The agent never needs the whole system in context.
- **About 20-35 files and roughly 1,500-2,500 lines.** Larger phases are split.
- **Inputs are written artifacts, not chat memory.** These are the contracts, ADRs, and the previous phase's handoff note.
- **A machine-checkable gate.** Tests, boundary lint, and typecheck are green. "Looks good" is never a gate.
- **A handoff file** at `docs/phases/PXX-handoff.md`: what was built, public API, decisions, known gaps.

## 2. Dependency graph

Phases on the same line can run in parallel agents.

```
P0 -> P0a -> P1 -> P2 -> P3
                        +-> P4 (Audit)
                        +-> P5 (Directory)
                        +-> P6 (Reference)
P1 -> P7 (Crediting core, pure; needs only the kernel)
P7 + P6 + P5 + P2 -> P10
P2 -> P8 -> P9 -> P10 -> P11 -> P12 -> P13
P3 + contracts -> P14 -> P15, P16, P17 (UI, parallel after P14)
All -> P18 -> P19 (optional)
```

## 3. Architecture and patterns at a glance

| Concern | Pattern |
|---|---|
| Module isolation | Modular monolith, public API facade per module, boundary lint in CI |
| Inside a module | Clean architecture: interface -> application -> domain; infrastructure implements ports |
| Domain | Aggregates, value objects, domain events, pure domain services |
| Cross-module messaging | Domain events through a transactional outbox, with an inbox for idempotent consumers |
| Cross-module reads | Query interface plus an anti-corruption layer that maps to local types |
| Calculation | Pure function: `decide(line, schedule, policy) -> CreditDecision` |
| Money-like state | Append-only ledger (Credit, Reversal, Adjustment); totals are always sums |
| Importing | Pipeline (parse -> map -> validate -> classify) plus a state machine on `ImportBatch` |
| Idempotency | Content hash per line version; `(consumer, eventId)` inbox; per-line advisory lock |
| Reads | CQRS-lite projections rebuilt from events, scoped by role |
| Tenancy | `practiceId` on every row plus Postgres row-level security |
| Time-varying data | Effective-dated records (targets, schedules, mappings) |
| Authorization | Policy-based (CASL): role plus provider scope plus function |

## 4. Phases

### P0: Repository, guardrails, module template
- **Module:** repo root
- **Build:** pnpm and Turborepo workspace, NestJS app (composition root only), strict TypeScript, ESLint, `dependency-cruiser` rules, architecture tests, module generator, Postgres via Docker Compose (Docker Engine in WSL2, reached with `wsl docker compose`), cross-platform Node scripts, environment check script, CI matrix (ubuntu and windows), `AGENTS.md`, ADR template.
- **Patterns:** composition root, module template, architecture-as-tests.
- **Gate:** a deliberately illegal import in a fixture makes CI fail; the generated module compiles and passes lint; CI is green on both operating systems.
- **ADRs:** 0001 modular monolith, 0002 events and outbox, 0003 tooling, 0004 dev environment.

### P0a: Guardrail follow-ups
- **Module:** repo root (config and tests only)
- **Build:** rename `doctor` script to `env:check` (pnpm 10 shadows `pnpm doctor`); composition-root rule so apps may import a module's `public-api.ts` and `<m>.module.ts`; package dependency rules; determinism lint rules for domain and application; generator emits `<m>.module.ts`; ADR 0005.
- **Patterns:** architecture-as-tests, composition root.
- **Gate:** every new rule has one violating and one passing fixture; `pnpm verify` green on both operating systems.

### P1: Shared kernel and test foundation
- **Module:** `packages/shared-kernel`, `packages/testing`, `tests/acceptance`
- **Build:** `Brand`/`Uuid`, `Result`, `DomainError`, immutable `DecimalValue` (strict parse, `toNumeric(12,4)` with no silent rounding, `percentOf`), `LocalDate`, half-open `DateRange`, `ValueObject`, `Entity`, `AggregateRoot` with event buffer, `DomainEvent`, `Clock` and `IdGenerator` ports, pagination. Testing package: fixed clock, sequential ids, seeded random, synthetic data builders and CSV writer (no patient fields), the brief scenario fixture, fast-check arbitraries. A skipped end-to-end acceptance test for the 360 -> 368 scenario.
- **Patterns:** value objects, aggregate root base, Result type, ports for time and ids, test data builders, property-based testing, outer acceptance test written first.
- **Gate:** decimal and date property tests pass; same seed gives identical synthetic data; the brief's arithmetic (360 -> 72.00 percent, 368 -> 73.60 percent) passes; the end-to-end block stays skipped until P11.
- **ADRs:** 0006 decimal and rounding, 0007 dates and time, 0008 synthetic data.

### P2: Platform infrastructure
- **Module:** `apps/api/platform`
- **Build:** choose the data-access library (ADR); migrations per module schema; Unit of Work over a Postgres transaction; transactional outbox table plus dispatcher; inbox table plus an idempotent-consumer decorator; `pg-boss` job runner; config; structured logging; request correlation id; global error mapping; tenant context through `AsyncLocalStorage`.
- **Patterns:** Unit of Work, transactional outbox, inbox, correlation context.
- **Gate:** integration tests with Testcontainers (via `DOCKER_HOST`) show events are published only if the transaction commits, and a duplicate delivery runs the handler once.

### P3: Identity and Access
- **Module:** `identity-access`
- **Build:** OIDC login (JWT validation), users, roles (Practitioner, Manager, Billing, Admin), provider-scope grants, CASL ability factory, an `@Authorize` guard, and Postgres RLS driven by a session `practice_id`. Admin has no clinical or compensation permissions.
- **Patterns:** policy-based authorization, RLS multi-tenancy, anti-corruption on the identity provider.
- **Gate:** a role-by-function permission matrix test; a cross-tenant read returns zero rows; "admin cannot read service lines" passes.

### P4: Audit
- **Module:** `audit`
- **Build:** append-only `audit_entry` table (update and delete revoked at the database level), an `AuditPort` for who/what/when/why, an event subscriber for domain events, and a query for entries by entity.
- **Patterns:** append-only log, event-carried audit.
- **Gate:** an update or delete on the audit table fails; entries carry the correlation id.

### P5: Practice Directory
- **Module:** `practice-directory`
- **Build:** `Practice`, `Location`, `Provider`, provider-ID mappings (source id -> provider), effective-dated `Target`, FTE and leave adjustments. Queries such as `resolveProvider(sourceId, date)` and `targetFor(providerId, period)`.
- **Patterns:** effective-dated records, repository, query interface.
- **Gate:** overlapping effective ranges are rejected; point-in-time lookups are correct at range boundaries.

### P6: Reference Data (RVU schedules)
- **Module:** `reference-data`
- **Build:** `RvuSchedule` version aggregate (source, effective dates, checksum), an importer for the official CMS relative value file, immutable once published, and the query `workRvuFor(code, modifier?, serviceDate, basis)`. Codes with no usable work value return an explicit `NoValue` result.
- **Patterns:** immutable versioned aggregate, temporal lookup, explicit not-found result.
- **Gate:** a quarter-boundary lookup picks the right version; re-importing the same file creates no new version.

### P7: Crediting core (pure domain)
- **Module:** `crediting/domain` only
- **Build:** `CreditingPolicy` value object (date basis, schedule basis, attribution rule, recognized statuses, supported modifier rules, correction-period rule), `CreditCalculator`, and the decision types `Credited | Excluded | NeedsReview`. Modifier rules form a registry; anything unsupported returns `NeedsReview`.
- **Patterns:** strategy, chain of responsibility for rules, specification for eligibility, pure function.
- **Gate:** property tests (non-negative credit, deterministic output, unsupported combinations never yield a number); mutation testing on the calculator.
- **Parallel:** runs alongside P2 to P6 because it needs only the kernel.

### P8: Ingestion A: upload, mapping, validation
- **Module:** `ingestion`
- **Build:** `ImportBatch` state machine (Uploaded -> Mapped -> Previewed -> Committed or Rejected), streaming CSV parse, saved column-mapping templates, Zod row validation, and preview with accepted and rejected counts and reasons.
- **Patterns:** state machine, pipeline of stages, streaming, parse-don't-validate.
- **Gate:** every input row is accepted, rejected with a reason, or flagged; the three counts sum to the row total (property test).

### P9: Ingestion B: line versioning and commit
- **Module:** `ingestion`
- **Build:** `SourceLine` identity `(practiceId, sourceSystem, sourceLineId)`, immutable `LineVersion` keyed by content hash, an idempotent commit, and events `ServiceLineAccepted`, `ServiceLineCorrected`, `ServiceLineVoided` through the outbox. Add `public-api.ts`.
- **Patterns:** versioned aggregate, content hashing, idempotent command, outbox.
- **Gate:** importing the same file N times creates no new versions or events; a changed line creates exactly one new version.

### P10: Crediting application and ledger
- **Module:** `crediting`
- **Build:** inbox consumers for the P9 events, ACL adapters to Directory and Reference Data, an append-only `CreditLedger` (Credit, Reversal, Adjustment), the policy's correction-period rule applied, and `CreditEntryPosted` and `ReviewRequested` events. Add a per-line advisory lock for ordering, a `RecalculateAffected` command, and a policy version store.
- **Patterns:** event-driven saga-lite, ACL, append-only ledger, advisory lock per aggregate, idempotent consumer.
- **Gate:** a correction produces a Reversal plus a new Credit with no double count; duplicate or out-of-order events leave the ledger sum unchanged; provider totals match a golden reference file.

### P11: Reconciliation
- **Module:** `reconciliation`
- **Build:** `ReviewItem` (Open -> Assigned -> Resolved with resolution and reason), filters by issue and owner, and resolution commands: map provider, approve a modifier rule, exclude with reason, accept a value. A resolution emits `ResolutionApplied`, which triggers recalculation in Crediting. It never changes a billing code.
- **Patterns:** workflow aggregate, command, event-triggered recalculation.
- **Gate:** resolving two lines and excluding one reproduces 360 -> 368, with unresolved values never counted in confirmed totals. The skipped end-to-end acceptance test from P1 is enabled and passes.

### P12: Reporting read models
- **Module:** `reporting`
- **Build:** idempotent projectors (provider-period totals, daily and monthly history, service mix, unresolved count, last successful refresh), query handlers scoped by role, target progress, and confirmed vs provisional separation. Projectors track an event position so they can rebuild from scratch.
- **Patterns:** CQRS-lite, projection with checkpoint, rebuildable read model.
- **Gate:** a full projection rebuild equals the incremental result; a practitioner query returns only their own provider.

### P13: Periods, snapshots, export
- **Module:** `reporting` (or a `periods` submodule)
- **Build:** `ReportingPeriod` (Open -> Closed -> Reopened), a snapshot that stores ledger entry ids, schedule version, policy version, and an input hash, a reopen rule requiring reason and authority, and CSV or PDF export.
- **Patterns:** state machine, snapshot with integrity hash.
- **Gate:** recomputing from the stored inputs reproduces the snapshot hash; reopening creates a new snapshot version and an audit entry.

### P14: Web foundation
- **Module:** `apps/web`
- **Build:** Next.js, OpenAPI-generated client, OIDC session, role-aware navigation, layout, and a design system with shared table and chart components.
- **Patterns:** generated contract client, feature-sliced folders, server state with TanStack Query.
- **Gate:** typecheck against the generated client; Playwright login per role shows only permitted navigation.

### P15: UI: import wizard and exception review
- **Build:** upload, column mapping, preview with validation results, commit; the review queue with filters, assignment, and resolution form.
- **Gate:** Playwright covers upload -> fix -> commit, and resolve -> totals update.

### P16: UI: dashboards
- **Build:** practice overview, practitioner detail with contributing service lines, targets and trends, a readable mobile summary, and a completeness banner ("last import, N unresolved") displayed before any shortfall is interpreted.
- **Gate:** the banner appears whenever coverage is incomplete; displayed numbers equal API values (visual and contract test).

### P17: UI: targets, periods, audit, reports
- **Build:** target configuration with effective dates, period close and reopen, report export, and an audit trail view.
- **Gate:** role matrix end-to-end test; a closed period blocks edits.

### P18: Hardening and acceptance
- **Build:** run the brief's seven acceptance conditions as an automated suite, encryption at rest and in transit, secrets management, backups with a restore drill, rate limiting, OpenTelemetry traces, load test on a large import, a security review, and HIPAA artifacts (risk analysis checklist, BAA inventory, data-flow diagram).
- **Gate:** the acceptance suite is green; a restore drill succeeds; a dependency and secret scan is clean.

### P19: Optional, behind feature flags
- **19a Compensation:** `compensation` module consuming `PeriodClosed` snapshots only, agreement terms stored, all outputs labeled "estimate" until approved.
- **19b Scheduled imports:** an adapter per source system behind the existing ingestion port.
- **19c Forecasting:** a separate read-only context that never alters the ledger.

## 5. Mapping the brief's acceptance conditions to tests

- **Row accountability:** property test that accepted + rejected + review counts equal input rows.
- **Repeat imports:** property test that importing a file N times leaves the ledger sum unchanged.
- **Corrections:** fixture-driven tests for replacement, reversal, and cross-period adjustment.
- **Calculation agreement:** golden test against the practice's reference report, with every difference documented.
- **Traceability:** test that recomputing from stored inputs reproduces the snapshot hash.
- **Access control:** matrix tests per role, including "admin cannot read clinical data."
- **Operational value:** pilot measurement against the discovery baseline (not automated).

## 6. Kickoff prompt template (use for every phase)

```text
You are implementing phase {PXX}: {name} of the RVU Monitoring modular monolith.

Read first: AGENTS.md, docs/plan/implementation-plan.md (phase {PXX}),
docs/plan/architecture.md, docs/phases/{previous}-handoff.md, docs/adr/*,
and the public-api.ts of: {dependency modules}.

Skills: before planning, read .agents/skills/<name>/SKILL.md for the baseline
(test-driven-development, typescript-pro) and these phase skills:
{up to four skills}. List the skills you loaded in your plan. AGENTS.md hard
rules, ADRs and this prompt win over skill guidance; record any skill guidance
you declined in the handoff.

Environment: developer runs on Windows (Node 22, pnpm, git, this agent). Docker
runs only inside WSL2. CI runs on ubuntu-latest and windows-latest. Scripts must
be cross-platform Node scripts.

Scope: only these paths may change: {module paths}. Never modify .agents/.
Before writing code: reply with a numbered plan and the file list, then wait
for my approval.

Build: {deliverables from the phase}.
Patterns required: {patterns}.

Process: (1) write failing tests for the gate below, (2) implement,
(3) run pnpm typecheck, lint, arch, test, (4) write
docs/phases/{PXX}-handoff.md with the public API, decisions, skills used, and
gaps.

Gate (all must pass): {gate}.
If a contract from another module is wrong or missing, stop and record it in
the handoff; do not edit that module. If anything seems wrong or contradictory,
stop and record it instead of working around it.
```

## 7. Notes on sequencing

- **Run P7 early.** It is the highest-risk logic and has no dependencies beyond the kernel, so review it with the billing lead as soon as it exists.
- **Lock the five open decisions before P7 and P10** (listed in docs/plan/architecture.md, section 6).
- **Keep the P1 acceptance test visible.** The skipped 360 -> 368 scenario turns green only at P11, which makes progress objectively measurable across agent sessions.
- **Splitting rule.** If any phase's handoff note shows it exceeded roughly 35 files, split it at the next planning step rather than letting phases grow.