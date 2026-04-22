import { customType, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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

export type UserRecord = typeof users.$inferSelect;
export type NewUserRecord = typeof users.$inferInsert;
export type RoadSegmentRecord = typeof roadSegments.$inferSelect;
export type NewRoadSegmentRecord = typeof roadSegments.$inferInsert;
