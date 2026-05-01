ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "road_name" text,
  ADD COLUMN IF NOT EXISTS "km_start" numeric(10, 3),
  ADD COLUMN IF NOT EXISTS "km_end" numeric(10, 3);

UPDATE "teams"
SET
  "road_name" = COALESCE("road_name", 'UNASSIGNED'),
  "km_start" = COALESCE("km_start", 0),
  "km_end" = COALESCE("km_end", 0);

ALTER TABLE "teams"
  ALTER COLUMN "road_name" SET NOT NULL,
  ALTER COLUMN "km_start" SET NOT NULL,
  ALTER COLUMN "km_end" SET NOT NULL,
  ADD CONSTRAINT "teams_km_range_check" CHECK ("km_start" <= "km_end");

CREATE INDEX IF NOT EXISTS "teams_active_road_range_idx"
  ON "teams" ("active", "road_name", "km_start", "km_end");
