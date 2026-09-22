import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../../identity/infrastructure/schema";

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
    capacityCheck: check("teams_capacity_check", sql`${table.capacityPerDay} >= 0`),
    rangeCheck: check("teams_km_range_check", sql`${table.kmStart} <= ${table.kmEnd}`),
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
    roleCheck: check("team_members_role_check", sql`${table.role} IN ('leader', 'member')`),
    teamMembersTeamUserUnique: unique("team_members_team_user_unique").on(
      table.teamId,
      table.userId,
    ),
  }),
);
