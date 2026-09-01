CREATE TABLE IF NOT EXISTS "work_order_photos" (
  "id" uuid PRIMARY KEY NOT NULL,
  "work_order_id" uuid NOT NULL REFERENCES "work_orders"("id"),
  "photo_path" text NOT NULL,
  "photo_hash" text NOT NULL,
  "lat" double precision NOT NULL,
  "lon" double precision NOT NULL,
  "captured_at" timestamp NOT NULL,
  "exif_lat" double precision,
  "exif_lon" double precision,
  "exif_captured_at" timestamp,
  "validation_status" text NOT NULL,
  "distance_meters" double precision,
  "time_diff_seconds" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_order_photos_work_order_id_unique"
  ON "work_order_photos" ("work_order_id");
