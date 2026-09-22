import { sql } from "drizzle-orm";
import {
  check,
  uniqueIndex,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { roadSegments } from "../../road-network/infrastructure/schema";

export const readings = pgTable(
  "readings",
  {
    id: uuid("id").primaryKey(),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    originKey: text("origin_key"),
    captureId: uuid("capture_id").references(() => vehicleCaptures.id),
    inputHash: text("input_hash"),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => roadSegments.id),
    source: text("source").notNull(),
    heightCm: integer("height_cm"),
    classification: text("classification"),
    confidence: doublePrecision("confidence").notNull(),
    score: doublePrecision("score").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceCheck: check(
      "readings_source_check",
      sql`${table.source} IN ('iot', 'vehicle', 'satellite')`,
    ),
    scoreCheck: check("readings_score_check", sql`${table.score} BETWEEN 0 AND 100`),
    confidenceCheck: check("readings_confidence_check", sql`${table.confidence} BETWEEN 0 AND 1`),
    coordinatesCheck: check(
      "readings_coordinates_check",
      sql`${table.lat} BETWEEN -90 AND 90 AND ${table.lon} BETWEEN -180 AND 180`,
    ),
    originUnique: uniqueIndex("readings_origin_unique")
      .on(table.source, table.originKey)
      .where(sql`${table.originKey} IS NOT NULL`),
    captureUnique: uniqueIndex("readings_capture_unique")
      .on(table.captureId)
      .where(sql`${table.captureId} IS NOT NULL`),
    latestObservationIndex: index("readings_latest_observation_idx").on(
      table.segmentId,
      table.source,
      sql`(COALESCE(${table.observedAt}, ${table.createdAt} AT TIME ZONE 'UTC')) DESC`,
      sql`${table.id} DESC`,
    ),
    segmentSourceCreatedAtIndex: index("readings_segment_source_created_at_idx").on(
      table.segmentId,
      table.source,
      table.createdAt,
    ),
  }),
);

export const vehicleCaptures = pgTable(
  "vehicle_captures",
  {
    id: uuid("id").primaryKey(),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => roadSegments.id),
    photoPath: text("photo_path").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    capturedAt: timestamp("captured_at").notNull(),
    classification: text("classification"),
    confidence: doublePrecision("confidence"),
    classifiedAt: timestamp("classified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    confidenceCheck: check(
      "vehicle_captures_confidence_check",
      sql`${table.confidence} BETWEEN 0 AND 1`,
    ),
    classificationCheck: check(
      "vehicle_captures_classification_check",
      sql`${table.classification} IN ('ok', 'attention', 'urgent')`,
    ),
    segmentCreatedAtIndex: index("vehicle_captures_segment_created_at_idx").on(
      table.segmentId,
      table.createdAt,
    ),
  }),
);
