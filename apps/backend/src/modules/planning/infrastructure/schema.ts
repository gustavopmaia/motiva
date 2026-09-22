import {
  check,
  jsonb,
  bigint,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { teams } from "../../teams/infrastructure/schema";
import { workOrders } from "../../maintenance/infrastructure/schema";

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
    statusCheck: check(
      "routes_status_check",
      sql`${table.status} IN ('pending_approval', 'approved', 'locked')`,
    ),
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

export const dispatchRequests = pgTable(
  "dispatch_requests",
  {
    teamId: uuid("team_id")
      .primaryKey()
      .references(() => teams.id, { onDelete: "cascade" }),
    requestedVersion: bigint("requested_version", { mode: "bigint" })
      .default(sql`1`)
      .notNull(),
    completedVersion: bigint("completed_version", { mode: "bigint" })
      .default(sql`0`)
      .notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    versionsCheck: check(
      "dispatch_requests_versions_check",
      sql`${table.completedVersion} >= 0 AND ${table.requestedVersion} >= ${table.completedVersion}`,
    ),
  }),
);

export const routeAudit = pgTable(
  "route_audit",
  {
    id: uuid("id").primaryKey(),
    routeId: uuid("route_id").notNull(),
    actorId: text("actor_id").notNull(),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    beforeState: jsonb("before_state").notNull(),
    afterState: jsonb("after_state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    routeIndex: index("route_audit_route_idx").on(table.routeId, table.createdAt),
    actionCheck: check("route_audit_action_check", sql`${table.action} IN ('status', 'items')`),
  }),
);
