UPDATE "work_orders"
SET "priority" = 'attention'
WHERE "priority" = 'normal';

ALTER TABLE "work_orders"
  ADD CONSTRAINT "work_orders_priority_check"
  CHECK ("priority" IN ('attention', 'urgent', 'critical'));

CREATE TABLE IF NOT EXISTS "teams" (
  "id" uuid PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "base_lat" double precision NOT NULL,
  "base_lng" double precision NOT NULL,
  "capacity_per_day" integer NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "team_members" (
  "id" uuid PRIMARY KEY NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "teams"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "role" text NOT NULL,
  CONSTRAINT "team_members_team_user_unique" UNIQUE ("team_id", "user_id"),
  CONSTRAINT "team_members_role_check" CHECK ("role" IN ('leader', 'member'))
);

CREATE TABLE IF NOT EXISTS "routes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "teams"("id"),
  "date" date NOT NULL,
  "status" text DEFAULT 'pending_approval' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "routes_status_check" CHECK ("status" IN ('pending_approval', 'approved', 'locked'))
);

CREATE INDEX IF NOT EXISTS "routes_team_date_idx" ON "routes" ("team_id", "date");
CREATE INDEX IF NOT EXISTS "routes_status_idx" ON "routes" ("status");

CREATE TABLE IF NOT EXISTS "route_items" (
  "id" uuid PRIMARY KEY NOT NULL,
  "route_id" uuid NOT NULL REFERENCES "routes"("id"),
  "work_order_id" uuid NOT NULL REFERENCES "work_orders"("id"),
  "order_index" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "route_items_route_order_unique" UNIQUE ("route_id", "order_index")
);

CREATE UNIQUE INDEX IF NOT EXISTS "route_items_work_order_unique"
  ON "route_items" ("work_order_id");
