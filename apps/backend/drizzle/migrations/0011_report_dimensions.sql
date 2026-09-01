ALTER TABLE "road_segments" ADD COLUMN IF NOT EXISTS "direction" text;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "location" text;

CREATE TABLE IF NOT EXISTS "generated_reports" (
  "id" uuid PRIMARY KEY NOT NULL,
  "report_type" text NOT NULL,
  "period" text NOT NULL,
  "format" text NOT NULL,
  "road_name" text,
  "generated_by" uuid NOT NULL REFERENCES "users"("id"),
  "generated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "generated_reports_type_period_idx"
  ON "generated_reports" ("report_type", "period");
