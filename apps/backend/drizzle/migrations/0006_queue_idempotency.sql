CREATE UNIQUE INDEX IF NOT EXISTS "alerts_open_segment_level_unique"
  ON "alerts" ("segment_id", "level")
  WHERE "closed_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "work_orders_alert_id_unique"
  ON "work_orders" ("alert_id");
