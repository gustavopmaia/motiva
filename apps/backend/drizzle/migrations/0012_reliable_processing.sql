CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  queue text NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_at timestamptz,
  completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text
);
--> statement-breakpoint
CREATE INDEX outbox_pending_idx ON outbox_events (available_at, created_at) WHERE completed_at IS NULL;
--> statement-breakpoint
ALTER TABLE road_segments ADD COLUMN risk_version integer NOT NULL DEFAULT 0,
  ADD COLUMN last_intervention_at timestamptz,
  ADD COLUMN risk_valid_until timestamptz,
  ADD COLUMN risk_policy_version text NOT NULL DEFAULT 'v1';
--> statement-breakpoint
ALTER TABLE readings ADD COLUMN observed_at timestamptz,
  ADD COLUMN origin_key text,
  ADD COLUMN input_hash text,
  ADD COLUMN capture_id uuid REFERENCES vehicle_captures(id);
--> statement-breakpoint
CREATE UNIQUE INDEX readings_origin_unique ON readings (source, origin_key) WHERE origin_key IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX readings_capture_unique ON readings (capture_id) WHERE capture_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX readings_latest_observation_idx ON readings (segment_id, source, (COALESCE(observed_at, created_at AT TIME ZONE 'UTC')) DESC, id DESC);
--> statement-breakpoint
CREATE INDEX road_segments_geography_idx ON road_segments USING gist ((geometry::geography));
--> statement-breakpoint
CREATE TABLE dispatch_requests (
  team_id uuid PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  requested_version bigint NOT NULL DEFAULT 1,
  completed_version bigint NOT NULL DEFAULT 0,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
INSERT INTO dispatch_requests (team_id) SELECT id FROM teams;

--> statement-breakpoint
ALTER TABLE work_orders ADD COLUMN team_id uuid REFERENCES teams(id);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM work_orders wo WHERE wo.team IS NOT NULL AND (SELECT count(*) FROM teams t WHERE t.name = wo.team) <> 1) THEN
    RAISE EXCEPTION 'Cannot backfill work_orders.team_id: resolve missing or ambiguous team names first';
  END IF;
END $$;
--> statement-breakpoint
UPDATE work_orders wo SET team_id = t.id FROM teams t WHERE wo.team = t.name;
--> statement-breakpoint
CREATE INDEX work_orders_team_status_idx ON work_orders (team_id, status);
--> statement-breakpoint
CREATE FUNCTION sync_work_order_team() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE matches integer;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.team_id IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.team_id IS DISTINCT FROM OLD.team_id) THEN
    IF NEW.team_id IS NULL THEN NEW.team := NULL;
    ELSE SELECT name INTO STRICT NEW.team FROM teams WHERE id = NEW.team_id;
    END IF;
  ELSIF TG_OP = 'INSERT' OR NEW.team IS DISTINCT FROM OLD.team THEN
    IF NEW.team IS NULL THEN NEW.team_id := NULL;
    ELSE
      SELECT count(*) INTO matches FROM teams WHERE name = NEW.team;
      IF matches <> 1 THEN RAISE EXCEPTION 'Team name must identify exactly one team'; END IF;
      SELECT id INTO NEW.team_id FROM teams WHERE name = NEW.team;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER work_order_team_identity BEFORE INSERT OR UPDATE OF team, team_id ON work_orders FOR EACH ROW EXECUTE FUNCTION sync_work_order_team();

--> statement-breakpoint
CREATE TABLE ingestion_rejections (id uuid PRIMARY KEY, topic text NOT NULL, payload text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp());

--> statement-breakpoint
UPDATE road_segments SET risk_valid_until = clock_timestamp() WHERE score_current IS NOT NULL;

--> statement-breakpoint
CREATE TABLE maintenance_audit (
  id uuid PRIMARY KEY, actor_id text NOT NULL, action text NOT NULL,
  work_order_id uuid NOT NULL REFERENCES work_orders(id), details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
CREATE INDEX maintenance_audit_order_idx ON maintenance_audit (work_order_id, created_at);

--> statement-breakpoint
CREATE TABLE outbox_replay_audit (id uuid PRIMARY KEY, event_id uuid NOT NULL, actor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
