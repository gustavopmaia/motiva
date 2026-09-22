import { teams } from "../../teams/infrastructure/schema";
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { roadSegments } from "../../road-network/infrastructure/schema";

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
    levelCheck: check(
      "alerts_level_check",
      sql`${table.level} IN ('attention', 'urgent', 'critical')`,
    ),
    scoreCheck: check("alerts_score_check", sql`${table.score} BETWEEN 0 AND 100`),
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
    teamId: uuid("team_id").references(() => teams.id),
    observation: text("observation"),
    location: text("location"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    priorityCheck: check(
      "work_orders_priority_check",
      sql`${table.priority} IN ('attention', 'urgent', 'critical')`,
    ),
    statusCheck: check(
      "work_orders_status_check",
      sql`${table.status} IN ('open', 'in_progress', 'completed')`,
    ),
    scoreCheck: check("work_orders_score_check", sql`${table.scoreAtCreation} BETWEEN 0 AND 100`),
    teamStatusIndex: index("work_orders_team_status_idx").on(table.teamId, table.status),
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

export const maintenanceAudit = pgTable(
  "maintenance_audit",
  {
    id: uuid("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    details: jsonb("details").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orderIndex: index("maintenance_audit_order_idx").on(table.workOrderId, table.createdAt),
  }),
);
