import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolve } from "path";
import { DrizzleService } from "./database/drizzle.service";

const TABLES = [
  "route_items",
  "routes",
  "work_orders",
  "alerts",
  "readings",
  "team_members",
  "teams",
  "road_segments",
  "password_reset_tokens",
  "api_keys",
  "users",
];

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export const describeDb = testDatabaseUrl ? describe : describe.skip;

export function createTestDrizzle(): DrizzleService {
  return new DrizzleService({
    getOrThrow: () => testDatabaseUrl,
  } as unknown as ConfigService);
}

export async function migrateTestDb(drizzle: DrizzleService): Promise<void> {
  await migrate(drizzle.db, {
    migrationsFolder: resolve(__dirname, "../drizzle/migrations"),
  });
}

export async function truncateAll(drizzle: DrizzleService): Promise<void> {
  await drizzle.db.execute(sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
}

export async function insertSegment(
  drizzle: DrizzleService,
  segment: {
    id: string;
    roadName: string;
    kmStart: number;
    kmEnd: number;
    lat?: number;
    lon?: number;
  },
): Promise<void> {
  const lat = segment.lat ?? 0;
  const lon = segment.lon ?? 0;

  await drizzle.db.execute(sql`
    INSERT INTO road_segments (id, road_name, km_start, km_end, geometry)
    VALUES (
      ${segment.id}, ${segment.roadName}, ${segment.kmStart}, ${segment.kmEnd},
      ST_SetSRID(ST_MakeLine(ST_MakePoint(${lon}, ${lat}), ST_MakePoint(${lon + 0.01}, ${lat + 0.01})), 4326)
    )
  `);
}

export async function insertTeam(
  drizzle: DrizzleService,
  team: {
    id: string;
    name: string;
    roadName: string;
    kmStart: number;
    kmEnd: number;
    baseLat?: number;
    baseLng?: number;
    capacityPerDay?: number;
    active?: boolean;
  },
): Promise<void> {
  await drizzle.db.execute(sql`
    INSERT INTO teams (id, name, base_lat, base_lng, road_name, km_start, km_end, capacity_per_day, active)
    VALUES (
      ${team.id}, ${team.name}, ${team.baseLat ?? 0}, ${team.baseLng ?? 0}, ${team.roadName},
      ${team.kmStart}, ${team.kmEnd}, ${team.capacityPerDay ?? 3}, ${team.active ?? true}
    )
  `);
}

export async function insertAlert(
  drizzle: DrizzleService,
  alert: { id: string; segmentId: string; level: string; score?: number },
): Promise<void> {
  await drizzle.db.execute(sql`
    INSERT INTO alerts (id, segment_id, level, score, channels)
    VALUES (${alert.id}, ${alert.segmentId}, ${alert.level}, ${alert.score ?? 60}, '{}'::jsonb)
  `);
}

export async function insertWorkOrder(
  drizzle: DrizzleService,
  workOrder: {
    id: string;
    segmentId: string;
    alertId: string;
    status?: string;
    priority?: string;
    team?: string | null;
  },
): Promise<void> {
  await drizzle.db.execute(sql`
    INSERT INTO work_orders (id, segment_id, alert_id, status, priority, score_at_creation, team)
    VALUES (
      ${workOrder.id}, ${workOrder.segmentId}, ${workOrder.alertId},
      ${workOrder.status ?? "open"}, ${workOrder.priority ?? "urgent"}, 70, ${workOrder.team ?? null}
    )
  `);
}
