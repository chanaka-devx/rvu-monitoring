# ADR 0015: Jobs, structured logging and HTTP platform adapters

Status: accepted; Docker integration evidence pending

pg-boss 12.38.0 is provisioned with getConstructionPlans('pgboss'), checked in
as platform migration 0004. tools/provision-jobs.mjs generated that SQL once and
refuses to overwrite it. Its outer BEGIN/COMMIT are stripped so the migration runner owns the
transaction. Upgrade with a new forward migration, never edit applied SQL.
Workers connect as rvu_app with migrate/createSchema disabled. Owners provision
queues in module migrations using pgboss.create_queue(name, options::jsonb),
with an explicit policy. Use '{"policy":"exclusive"}'::jsonb for queues using
singletonKey, so duplicate outstanding keys are rejected by a unique index.
Runtime register attaches a worker to an existing queue; it performs no DDL.
Owner default privileges grant access to future queue partitions. If a different
owner creates queues, that operator must configure equivalent default grants.
Supervision and scheduling are disabled in runtime workers; operators must run
maintenance separately. This is a known operational gap until maintenance is wired.

Job envelopes restore practice and correlation context; handlers choose UoW scope.
Singleton keys delegate deduplication to pg-boss. stop awaits graceful worker exit.

Pino emits JSON with context mixins. Structured fields named password/token and
authorization/cookie are redacted recursively. Request body, query and event
payload fields are omitted. Callers must never interpolate those values into log
messages. Request logs include method, route template, status and duration only.
Unexpected errors include stacks in logs and generic problem+json in responses.

Nest adapters live only in apps/api. Correlation IDs are safe 8-64 character
strings or generated UUIDv7. Errors map domain kinds to 422/404/409/403/401/500;
HttpException preserves status. Readiness has a 2-second deadline and uses the
app pool; liveness stays unchanged. Shutdown stops dispatcher/jobs before pools.

Workspace package exports currently point to TypeScript. API built output uses
node --import tsx so those entries and uuid ESM work on Node 22; the build and
built correlation adapter were executed successfully, as was the Vitest adapter.
This avoids changes to shared-kernel package metadata outside P2 scope.
