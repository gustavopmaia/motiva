import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
    direction: text("direction"),
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
    segmentCreatedAtIndex: index("vehicle_captures_segment_created_at_idx").on(
      table.segmentId,
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
    closedAt: timestamp("closed_at"),
  },
  (table) => ({
    alertsSegmentLevelIndex: index("alerts_segment_level_idx").on(table.segmentId, table.level),
    alertsOpenSegmentLevelUnique: uniqueIndex("alerts_open_segment_level_unique")
      .on(table.segmentId, table.level)
      .where(sql`${table.closedAt} IS NULL`),
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
    location: text("location"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    workOrdersAlertIdUnique: uniqueIndex("work_orders_alert_id_unique").on(table.alertId),
    workOrdersStatusIdx: index("work_orders_status_idx").on(table.status),
    workOrdersSegmentIdx: index("work_orders_segment_idx").on(table.segmentId),
  }),
);

export const workOrderPhotos = pgTable(
  "work_order_photos",
  {
    id: uuid("id").primaryKey(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    photoPath: text("photo_path").notNull(),
    photoHash: text("photo_hash").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    capturedAt: timestamp("captured_at").notNull(),
    exifLat: doublePrecision("exif_lat"),
    exifLon: doublePrecision("exif_lon"),
    exifCapturedAt: timestamp("exif_captured_at"),
    validationStatus: text("validation_status").notNull(),
    distanceMeters: doublePrecision("distance_meters"),
    timeDiffSeconds: integer("time_diff_seconds"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    workOrderIdUnique: uniqueIndex("work_order_photos_work_order_id_unique").on(table.workOrderId),
  }),
);

export const generatedReports = pgTable(
  "generated_reports",
  {
    id: uuid("id").primaryKey(),
    reportType: text("report_type").notNull(),
    period: text("period").notNull(),
    format: text("format").notNull(),
    roadName: text("road_name"),
    generatedBy: uuid("generated_by")
      .notNull()
      .references(() => users.id),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
  },
  (table) => ({
    generatedReportsTypePeriodIdx: index("generated_reports_type_period_idx").on(
      table.reportType,
      table.period,
    ),
  }),
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    baseLat: doublePrecision("base_lat").notNull(),
    baseLng: doublePrecision("base_lng").notNull(),
    roadName: text("road_name").notNull(),
    kmStart: numeric("km_start", { precision: 10, scale: 3 }).notNull(),
    kmEnd: numeric("km_end", { precision: 10, scale: 3 }).notNull(),
    capacityPerDay: integer("capacity_per_day").notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (table) => ({
    teamsActiveRoadRangeIdx: index("teams_active_road_range_idx").on(
      table.active,
      table.roadName,
      table.kmStart,
      table.kmEnd,
    ),
  }),
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
  },
  (table) => ({
    teamMembersTeamUserUnique: unique("team_members_team_user_unique").on(
      table.teamId,
      table.userId,
    ),
  }),
);

export const routes = pgTable(
  "routes",
  {
    id: uuid("id").primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    date: date("date").notNull(),
    status: text("status").notNull().default("pending_approval"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    routesTeamDateIdx: index("routes_team_date_idx").on(table.teamId, table.date),
    routesStatusIdx: index("routes_status_idx").on(table.status),
  }),
);

export const routeItems = pgTable(
  "route_items",
  {
    id: uuid("id").primaryKey(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    orderIndex: integer("order_index").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    routeItemsRouteOrderUnique: unique("route_items_route_order_unique").on(
      table.routeId,
      table.orderIndex,
    ),
    routeItemsWorkOrderUnique: uniqueIndex("route_items_work_order_unique").on(table.workOrderId),
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
