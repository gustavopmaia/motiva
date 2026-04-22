import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const lineStringGeometry = customType<{ data: string }>({
  dataType() {
    return "geometry(LineString, 4326)";
  },
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const roadSegments = pgTable(
  "road_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roadName: text("road_name").notNull(),
    kmStart: numeric("km_start", { precision: 10, scale: 3 }).notNull(),
    kmEnd: numeric("km_end", { precision: 10, scale: 3 }).notNull(),
    mowingType: text("mowing_type"),
    geometry: lineStringGeometry("geometry").notNull(),
    scoreCurrent: doublePrecision("score_current"),
    scoreDivergent: boolean("score_divergent").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    roadNameKmRangeUnique: unique("road_segments_road_name_km_range_unique").on(
      table.roadName,
      table.kmStart,
      table.kmEnd,
    ),
  }),
);

export const readings = pgTable(
  "readings",
  {
    id: uuid("id").primaryKey(),
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
    segmentSourceCreatedAtIndex: index("readings_segment_source_created_at_idx").on(
      table.segmentId,
      table.source,
      table.createdAt,
    ),
  }),
);

export type UserRecord = typeof users.$inferSelect;
export type NewUserRecord = typeof users.$inferInsert;
export type RoadSegmentRecord = typeof roadSegments.$inferSelect;
export type NewRoadSegmentRecord = typeof roadSegments.$inferInsert;
export type ReadingRecord = typeof readings.$inferSelect;
export type NewReadingRecord = typeof readings.$inferInsert;
