# P02f platform test gap-fill

Status: DONE. Plan approval was not required; the verify gate failed at
typecheck on pre-existing merge damage outside P2f scope, and the owner
authorized restoring three P1b files to their state at commit 06c15c3 (both
files below it were listed in the authorization request; the third,
packages/testing/src/index.ts, was found required for `expectOk` in the
acceptance test and is explicitly listed here).

## Audit table

Paths: P = packages/platform/src, A = apps/api/src/platform. Tests were run
with DOCKER_HOST=tcp://127.0.0.1:2375.

| Case | File — test name |
| --- | --- |
| 1 roll/commit atomicity | P/outbox-gaps.int.test.ts — leaves zero outbox rows on rollback and exactly one on commit |
| 2 two consumers once each | P/outbox-gaps.int.test.ts — delivers exactly once to each of two consumers and does not redeliver |
| 3 inbox crash before ack | P/outbox-gaps.int.test.ts — does not rerun inbox consumers after failure before published_at is set |
| 4 backoff/last_error/dead | P/outbox-gaps.int.test.ts — backs off exponentially with a cap, hides payloads, and dies at the maximum attempts |
| 5 head blocks, dead releases | P/outbox-gaps.int.test.ts — blocks only the failing aggregate and releases its follower after the head is dead |
| 6 sequence order | P/outbox.int.test.ts — delivers successive events of one aggregate in sequence order |
| 7 tenant context + RLS | P/outbox.int.test.ts — requires tenant and UoW, rolls back publication, and delivers committed events once per consumer |
| 8 advisory-lock leader | P/outbox.int.test.ts — backs off failures, preserves aggregate ordering, and elects one dispatcher |
| 9 outbox statistics | P/outbox-gaps.int.test.ts — reports pending count, dead count and oldest pending age including empty pending state |
| 10 readiness 200/503 | A/http.int.test.ts — returns 503 after the pool closes; A/http-gaps.int.test.ts — returns correlated 503 problem+json after closing the app pool |
| 11 correlation echo/generate | A/http-gaps.int.test.ts — echoes valid correlation and generates a full UUIDv7 for invalid and absent headers |
| 12 all DomainError kinds | A/http-gaps.int.test.ts — maps every DomainError kind to correlated problem+json with validation errors |
| 13 500 leaks nothing | A/http-gaps.int.test.ts — conceals unknown error messages and stacks while logging the stack |
| 14 job context restore | P/jobs.int.test.ts — deduplicates singleton jobs and restores context in a runtime-role worker |
| 15 singleton + clean stop | P/jobs-gaps.int.test.ts — deduplicates singleton jobs and completes graceful stop after processing |
| 16 log redaction | P/logger-gaps.test.ts — redacts credential values and omits request bodies and query strings in serialized JSON |
| Migration tamper/dup/gap | P/migrations/runner.int.test.ts — fails when an applied migration was tampered with / fails on duplicate versions in the source list / fails on a version gap in the source list |
| Migration concurrent | P/migrations/runner.int.test.ts — serializes concurrent runners so each migration applies exactly once |
| Type parsers | P/pool.int.test.ts — returns strings for numeric(12,4), date and bigint; Date for timestamptz |
| Stage C RLS cases | P/tenancy.int.test.ts — fails closed without a tenant and restores transaction-local settings with pool max 1 / rejects cross-tenant inserts and updates / FORCE subjects a non-superuser table owner to the policy / restricts the runtime role and denies schema and table creation |

## Evidence (gates)

- `pnpm verify` with DOCKER_HOST=tcp://127.0.0.1:2375: all green - typecheck
  5/5, lint, arch (126 modules, 302 deps), unit 365 passed (+4 todo), int
  36 passed across 10 suites.
- Platform/outbox/jobs/logger gap tests: 11 new tests, all passing.

## Files in this commit

- New: the four *-gaps test files above and this handoff.
- Owner-authorized merge-damage restore (about 30 lines total): packages/testing/package.json
  (re-add @rvu/shared-kernel and fast-check), .dependency-cruiser.cjs (re-add the
  two P1b rules and the tooling-visibility exclusion regex, extended with
  .pnpm-stub for the P2 resolved-NestJS fixture), packages/testing/src/index.ts
  (restore P1b exports), pnpm-lock.yaml (pnpm install re-link).

## Skills

Loaded: typescript-pro, postgres-best-practices (phase), baselines. Declined
skill guidance: no ORM/decorator/DB-type patterns in the domain; no Docker
Desktop/bind mounts; project rules and ADRs took precedence throughout.

## Notes

- Fix rounds: 0 against platform/API implementation; no source changes under
  packages/platform or apps/api.
- backlog.md: appended the merge-reconciliation note.
- No push performed.
