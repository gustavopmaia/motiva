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
  role: text("role").notNull().default("field"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  source: text("source").notNull(),
  key: text("key").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey(),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => roadSegments.id),
    osId: text("os_id"),
    level: text("level").notNull(),
    score: doublePrecision("score").notNull(),
    channels: jsonb("channels").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    alertsSegmentLevelIndex: index("alerts_segment_level_idx").on(table.segmentId, table.level),
  }),
);

export const workOrders = pgTable(
  "work_orders",
  {
    id: uuid("id").primaryKey(),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => roadSegments.id),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull(),
    scoreAtCreation: doublePrecision("score_at_creation").notNull(),
    team: text("team"),
    observation: text("observation"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    workOrdersStatusIdx: index("work_orders_status_idx").on(table.status),
    workOrdersSegmentIdx: index("work_orders_segment_idx").on(table.segmentId),
  }),
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    passwordResetUserCreatedAtIdx: index("password_reset_user_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);
