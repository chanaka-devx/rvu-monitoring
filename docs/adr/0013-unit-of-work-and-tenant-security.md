# ADR 0013: Unit of Work and tenant security

Status: accepted

Execution context uses immutable, nested AsyncLocalStorage scopes. PgUnitOfWork
opens a Kysely transaction, sets app.practice_id transaction-locally and joins
nested calls. Repositories use getExecutor so all writes share that transaction.
CurrentTenant rejects missing tenant context. Context is never authentication.

Owners run migrations; rvu_app is LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
NOBYPASSRLS. Local db:bootstrap provisions it; production provisioning belongs
to operators. Passwords are never printed. Bootstrap requires owner privileges.

Tenant tables must have practice_id uuid not null. The migration helper enables
and forces RLS with both USING and WITH CHECK. Missing/empty context fails closed.
Only the owner invokes the helper. PUBLIC execution is revoked. Superusers and
tables without RLS remain outside this protection. Runtime grants are explicit.

For future optimistic concurrency, restore AggregateRoot.version through a
protected persistence hydration API and compare the expected version in UPDATE;
do not implement that kernel change in P2.
