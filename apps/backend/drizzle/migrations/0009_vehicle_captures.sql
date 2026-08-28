CREATE TABLE IF NOT EXISTS "vehicle_captures" (
  "id" uuid PRIMARY KEY NOT NULL,
  "segment_id" uuid NOT NULL REFERENCES "road_segments"("id"),
  "photo_path" text NOT NULL,
  "lat" double precision NOT NULL,
  "lon" double precision NOT NULL,
  "captured_at" timestamp NOT NULL,
  "classification" text,
  "confidence" double precision,
  "classified_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "vehicle_captures_segment_created_at_idx"
  ON "vehicle_captures" ("segment_id", "created_at");
