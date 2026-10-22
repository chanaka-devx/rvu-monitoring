# Planned API Surface: RVU Monitoring

Derived from docs/plan/implementation-plan.md. Routes are **provisional**: each module's phase finalizes its endpoints and records changes in that phase's handoff note.

**Conventions (all REST routes):**
- Base path `/api/v1`, described by OpenAPI. The web client is generated from it.
- The tenant (`practiceId`) comes from the token, never from the URL.
- Cursor pagination, RFC 7807 `problem+json` errors, and a correlation id on every response.
- `Idempotency-Key` header on commit, resolve, close, and recalculate calls.
- Long-running work returns `202` plus a job URL.
- Roles: **Pr** Practitioner (own provider only), **Mg** Manager/owner, **Bi** Billing/coding, **Ad** System admin (no clinical or compensation data).

## 1. External REST API

### Identity & Access (P3)
| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/me` | Current user, role, permitted providers and functions | All |
| GET | `/users` | List users | Ad, Mg |
| POST | `/users` | Invite or create a user | Ad |
| PATCH | `/users/{id}` | Update status, name | Ad |
| PUT | `/users/{id}/role` | Assign role | Ad |
| PUT | `/users/{id}/provider-scopes` | Grant which providers a user may see | Ad, Mg |

Login itself goes through the OIDC provider, so there are no password endpoints.

### Practice Directory (P5)
| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET / PATCH | `/practice` | Practice profile and settings | Mg |
| GET / POST | `/locations` | List or add locations | Mg |
| PATCH | `/locations/{id}` | Edit a location | Mg |
| GET / POST | `/providers` | List or add providers | Mg |
| GET / PATCH | `/providers/{id}` | Provider detail, specialty, employment type | Mg |
| GET / POST | `/providers/{id}/source-mappings` | Map billing-system provider ids to a provider | Bi, Mg |
| DELETE | `/providers/{id}/source-mappings/{mappingId}` | End a mapping | Bi, Mg |
| GET / POST | `/providers/{id}/targets` | Effective-dated targets | Mg (Pr read own) |
| PATCH | `/providers/{id}/targets/{targetId}` | Correct or end a target | Mg |
| GET / POST | `/providers/{id}/adjustments` | FTE and leave adjustments | Mg |

### Reference Data (P6)
| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/rvu-schedules` | List schedule versions with source and effective dates | Bi, Mg |
| GET | `/rvu-schedules/{id}` | Version detail and checksum | Bi, Mg |
| POST | `/rvu-schedules/imports` | Upload an official CMS relative value file | Bi, Mg |
| POST | `/rvu-schedules/{id}/publish` | Make a version immutable and usable | Mg |
| GET | `/rvu-schedules/{id}/codes/{code}` | Value for a code in a version | Bi, Mg |
| GET | `/rvu-lookup?code=&modifier=&serviceDate=` | Resolve the value that applies under the active policy | Bi, Mg |

### Crediting (P7, P10)
| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/crediting-policies` | List policy versions | Bi, Mg |
| POST | `/crediting-policies` | Create a draft policy version | Mg |
| GET | `/crediting-policies/active` | Currently active policy | Bi, Mg, Pr |
| GET | `/crediting-policies/{id}` | Policy detail (date basis, schedule basis, attribution, statuses) | Bi, Mg |
| PUT | `/crediting-policies/{id}/modifier-rules` | Supported code/modifier combinations and handling | Bi |
| POST | `/crediting-policies/{id}/approve` | Billing lead approval | Bi |
| POST | `/crediting-policies/{id}/activate` | Activate for a period | Mg |
| GET | `/credit-entries` | Ledger entries filtered by provider, period, kind | Bi, Mg, Pr (own) |
| GET | `/service-lines/{id}/credit-history` | Credit, reversal, and adjustment trail for a line | Bi, Mg, Pr (own) |
| POST | `/recalculations` | Recalculate affected lines (202) | Bi, Mg |
| GET | `/recalculations/{id}` | Recalculation status | Bi, Mg |

### Ingestion (P8, P9)
| Method | Path | Purpose | Roles |
|---|---|---|---|
| POST | `/imports` | Create a batch and upload a CSV (multipart) | Bi |
| GET | `/imports` | List batches | Bi, Mg |
| GET | `/imports/{id}` | Status, counts, timestamps | Bi, Mg |
| PUT | `/imports/{id}/mapping` | Set column mapping | Bi |
| GET | `/imports/{id}/preview` | Sample records and validation summary | Bi |
| GET | `/imports/{id}/rows?outcome=` | Rows that were accepted, rejected, or sent to review, with reasons | Bi |
| POST | `/imports/{id}/commit` | Commit the batch | Bi |
| POST | `/imports/{id}/reject` | Discard before commit | Bi |
| GET / POST | `/mapping-templates` | Saved column-mapping templates | Bi |
| PUT / DELETE | `/mapping-templates/{id}` | Edit or remove a template | Bi |
| GET | `/service-lines` | Search lines by provider, date, code, status | Bi, Mg, Pr (own) |
| GET | `/service-lines/{id}` | Line detail | Bi, Mg, Pr (own) |
| GET | `/service-lines/{id}/versions` | Immutable version history | Bi, Mg |

### Reconciliation (P11)
| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/review-items` | Filter by issue, owner, status, provider | Bi, Mg |
| GET | `/review-items/summary` | Counts by issue and age | Bi, Mg |
| GET | `/review-items/{id}` | Item with source line and calculation context | Bi, Mg |
| POST | `/review-items/{id}/assign` | Assign an owner | Bi, Mg |
| POST | `/review-items/{id}/resolve` | Resolve with a type and reason: map provider, approve rule, exclude, accept value | Bi |
| POST | `/service-lines/{id}/queries` | Practitioner raises a question about a line | Pr (own) |

### Reporting, periods, snapshots (P12, P13)
| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/reports/practice-overview?period=` | Practice totals, target progress, trends, unresolved count | Mg |
| GET | `/reports/providers/{id}/summary?period=` | Credited wRVUs, target progress, confirmed vs provisional | Mg, Pr (own) |
| GET | `/reports/providers/{id}/history?granularity=` | Daily or monthly history | Mg, Pr (own) |
| GET | `/reports/providers/{id}/service-mix` | Mix by code group | Mg, Pr (own) |
| GET | `/reports/providers/{id}/service-lines?period=` | Contributing lines behind the total | Mg, Bi, Pr (own) |
| GET | `/reports/completeness` | Last successful import, unresolved lines, coverage statement | All clinical roles |
| GET | `/reports/me/summary` | Compact practitioner summary for mobile | Pr |
| GET | `/periods` | List periods and status | Mg, Bi |
| POST | `/periods/{id}/close` | Close and create a snapshot | Mg (authorized) |
| POST | `/periods/{id}/reopen` | Reopen with reason | Mg (authorized) |
| GET | `/periods/{id}/snapshots` | Snapshot versions | Mg, Bi |
| GET | `/snapshots/{id}` | Snapshot totals plus policy and schedule versions | Mg, Bi |
| POST | `/snapshots/{id}/verify` | Recompute from inputs and compare the hash | Mg, Bi |
| POST | `/exports` | Request a report export, CSV or PDF (202) | Mg, Bi |
| GET | `/exports/{id}` | Export status and download link | Mg, Bi |

### Audit (P4)
| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/audit-entries?entityType=&entityId=&actor=&from=&to=` | Who changed what, when, and why | Mg, Bi (clinical scope); Ad (access and configuration only) |

### Compensation (P19a, feature-flagged)
| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET / POST | `/compensation/agreements` | Agreement terms: threshold, rate, period, effective dates | Mg |
| POST | `/compensation/agreements/{id}/approve` | Authorized approval | Mg (authorized) |
| GET | `/compensation/estimates?period=&providerId=` | Estimates, labeled as estimates, built from closed snapshots | Mg |
| POST | `/compensation/estimates/{id}/approve` | Approve an estimate | Mg (authorized) |

### Platform
| Method | Path | Purpose |
|---|---|---|
| GET | `/health/live`, `/health/ready` | Liveness and readiness (built in P0) |
| GET | `/openapi.json` | Contract for client generation |
| GET | `/jobs/{id}` | Status of any `202` operation (import commit, recalculation, export) |

## 2. Internal module APIs (not exposed over HTTP)

Each module's `public-api.ts` is the only thing other modules may import.

| Module | Query facade (sync reads) | Events published |
|---|---|---|
| Ingestion | `getLineVersion(lineId, versionId)` | `ImportCommitted`, `ServiceLineAccepted`, `ServiceLineCorrected`, `ServiceLineVoided` |
| Crediting | `getLedgerEntries(filter)`, `getActivePolicy(date)` | `CreditEntryPosted`, `ReviewRequested`, `PolicyActivated` |
| Reference Data | `workRvuFor(code, modifier, date, basis)` | `ScheduleVersionPublished` |
| Practice Directory | `resolveProvider(sourceId, date)`, `targetFor(providerId, period)` | `ProviderMappingChanged`, `TargetChanged` |
| Reconciliation | `getOpenReviewCount(filter)` | `ReviewItemResolved`, `ResolutionApplied` |
| Reporting | `getSnapshot(periodId)` | `PeriodClosed`, `PeriodReopened` |
| Identity & Access | `can(user, action, resource)`, `providerScopeFor(user)` | `UserRoleChanged` |
| Audit | `record(entry)` | none (consumes events from all modules) |
| Compensation | none external | `EstimateApproved` |

Key event flows:
- **Ingestion -> Crediting:** `ServiceLineAccepted`, `ServiceLineCorrected`, `ServiceLineVoided`.
- **Crediting -> Reporting and Reconciliation:** `CreditEntryPosted`, `ReviewRequested`.
- **Reconciliation -> Crediting:** `ResolutionApplied` triggers recalculation.
- **Reporting -> Compensation:** `PeriodClosed`, so compensation only reads closed snapshots.

## 3. Rules the API must enforce

- **No clinical data for Admin.** `Ad` is rejected on `service-lines`, `reports`, `credit-entries`, and `compensation` routes, even for list endpoints.
- **Practitioners are scoped to themselves.** A practitioner request for another provider's data returns `404`, not `403`, so existence isn't leaked.
- **Confirmed vs provisional** is a field on every total in report responses, never inferred by the client.
- **Every report response carries** the period, policy version, schedule version, and last refresh time.
- **Writes after close** return `409` unless the period was reopened.
- **No endpoint changes billing codes or submits claims.** Resolutions only record decisions inside this system.