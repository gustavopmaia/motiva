CREATE TABLE api_key_audit (
  id uuid PRIMARY KEY,
  key_id uuid NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('rotated', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
CREATE INDEX api_key_audit_key_idx ON api_key_audit (key_id, created_at);
