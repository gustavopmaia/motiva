import { sql } from "drizzle-orm";
import {
  jsonb,
  check,
  index,
  boolean,
  customType,
  doublePrecision,
  integer,
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
    riskContributions: jsonb("risk_contributions")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    riskVersion: integer("risk_version").default(0).notNull(),
    lastInterventionAt: timestamp("last_intervention_at", { withTimezone: true }),
    riskValidUntil: timestamp("risk_valid_until", { withTimezone: true }),
    riskPolicyVersion: text("risk_policy_version").default("v1").notNull(),
    scoreDivergent: boolean("score_divergent").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    scoreCheck: check("road_segments_score_check", sql`${table.scoreCurrent} BETWEEN 0 AND 100`),
    kmCheck: check("road_segments_km_check", sql`${table.kmStart} <= ${table.kmEnd}`),
    versionCheck: check("road_segments_risk_version_check", sql`${table.riskVersion} >= 0`),
    geographyIndex: index("road_segments_geography_idx").using(
      "gist",
      sql`(${table.geometry}::geography)`,
    ),
    roadNameKmRangeUnique: unique("road_segments_road_name_km_range_unique").on(
      table.roadName,
      table.kmStart,
      table.kmEnd,
    ),
  }),
);
