CREATE TABLE platform.outbox (
  sequence bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  practice_id uuid NOT NULL,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  schema_version int NOT NULL,
  payload jsonb NOT NULL,
  correlation_id text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  dead_at timestamptz,
  last_error text
);
CREATE INDEX outbox_pending ON platform.outbox(sequence) WHERE published_at IS NULL AND dead_at IS NULL;
CREATE TABLE platform.inbox (
  consumer text NOT NULL,
  event_id uuid NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);
GRANT INSERT, SELECT, UPDATE ON platform.outbox TO rvu_app;
GRANT USAGE, SELECT ON SEQUENCE platform.outbox_sequence_seq TO rvu_app;
GRANT INSERT, SELECT ON platform.inbox TO rvu_app;
