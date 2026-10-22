# Skills Map

Skills live in .agents/skills/. Baseline for every phase: test-driven-development
and typescript-pro. The table lists the extra skills (max four) to load per phase.
Rules for using skills are in AGENTS.md ("Skills").

| Skill | Used for |
|---|---|
| nestjs-expert | Composition root, modules, DI, controllers, guards, middleware |
| domain-driven-design | Strategic modeling, bounded contexts, ubiquitous language |
| ddd-tactical-patterns | Aggregates, value objects, line versions, domain events |
| ddd-context-mapping | ACLs and contracts between modules |
| postgres-best-practices | Indexing, isolation, advisory locks, ledger performance, RLS |
| database-design | Schemas, migrations, key strategy, query design |
| test-driven-development | Red-green-refactor (baseline) |
| typescript-pro | Typing, type guards, zero `any` (baseline) |
| clean-code | Naming, single responsibility, readability |
| api-design | REST endpoints, versioning, errors, OpenAPI |
| docker-expert | Docker in WSL2, compose, healthchecks, Testcontainers |

| Phase | Extra skills |
|---|---|
| P0a Guardrail follow-ups | nestjs-expert, clean-code |
| P1 Shared kernel and test foundation | ddd-tactical-patterns, clean-code |
| P2 Platform infrastructure | nestjs-expert, postgres-best-practices, database-design, docker-expert |
| P3 Identity and Access | nestjs-expert, api-design, postgres-best-practices, ddd-context-mapping |
| P4 Audit | database-design, postgres-best-practices, nestjs-expert |
| P5 Practice Directory | domain-driven-design, ddd-tactical-patterns, database-design, api-design |
| P6 Reference Data | ddd-tactical-patterns, database-design, postgres-best-practices, api-design |
| P7 Crediting core (pure domain) | domain-driven-design, ddd-tactical-patterns, clean-code |
| P8 Ingestion A | ddd-tactical-patterns, nestjs-expert, api-design, clean-code |
| P9 Ingestion B | ddd-tactical-patterns, ddd-context-mapping, postgres-best-practices, database-design |
| P10 Crediting application and ledger | ddd-context-mapping, ddd-tactical-patterns, postgres-best-practices, nestjs-expert |
| P11 Reconciliation | ddd-tactical-patterns, ddd-context-mapping, api-design, nestjs-expert |
| P12 Reporting read models | postgres-best-practices, database-design, api-design, nestjs-expert |
| P13 Periods, snapshots, export | ddd-tactical-patterns, postgres-best-practices, api-design |
| P14 Web foundation | api-design, clean-code |
| P15-P17 UI phases | api-design, clean-code |
| P18 Hardening and acceptance | docker-expert, postgres-best-practices, api-design |
| P19 Optional modules | domain-driven-design, ddd-context-mapping, api-design |

## Gaps

- No frontend skill (Next.js, React, TanStack, Playwright) for P14-P17. Add one
  before P14, or those phases rely on the agent's general knowledge.
- No security or HIPAA skill for P3 (RLS and authorization) and P18. Add one if
  available; otherwise the P18 prompt will spell out the checklist explicitly.