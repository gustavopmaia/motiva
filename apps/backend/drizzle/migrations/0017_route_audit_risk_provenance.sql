CREATE TABLE route_audit (
  id uuid PRIMARY KEY,
  route_id uuid NOT NULL,
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL CHECK (action IN ('status', 'items')),
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX route_audit_route_idx ON route_audit (route_id, created_at);
--> statement-breakpoint
ALTER TABLE road_segments ADD COLUMN risk_contributions jsonb NOT NULL DEFAULT '[]'::jsonb;
