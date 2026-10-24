# ADR 0014: Transactional event delivery

Status: accepted

EventPublisher is a kernel port. PgOutboxPublisher requires a UoW and tenant,
and stores execution-context metadata in the same transaction as business writes.
The dispatcher uses a dedicated session advisory lock, one leader per database.
Pending aggregate heads are ordered by sequence within practice and aggregate.
Each consumer inbox insert and handler run share a UoW; committed consumers are
skipped on retry even if the event acknowledgement was lost. No subscribers
means successful publication. Dead events stop blocking later aggregate events.

Polling, batch size, attempts and exponential backoff are configurable. The Clock
port controls dispatch time. Handler errors store a fixed bounded message because
exception messages can contain payloads. Dispatch errors go to an error callback.
Shutdown waits for the active dispatch before releasing the leader connection.

Accepted risk: outbox/inbox have no RLS because dispatch is cross-tenant. rvu_app
has INSERT/SELECT/UPDATE on outbox and INSERT/SELECT on inbox, never DELETE.
Module code receives only EventPublisher; SQL boundary rules keep direct driver
access in platform. Handlers restore tenant context before opening a UoW.
