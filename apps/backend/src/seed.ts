import * as argon2 from "argon2";
import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";
import { DispatchService } from "./work-orders/dispatch.service";
import { DrizzleService } from "./database/drizzle.service";

/**
 * Demo data for the Motiva presentation: two teams on BR-101, segments with
 * fused scores, readings from the three sources, open alerts, work orders, and
 * the routes the dispatch job builds out of them.
 *
 * Every row is resolved by its natural key (team name, segment km range, user
 * email) instead of a fixed id, so the seed is idempotent and also safe to run
 * against an environment that already holds real data.
 *
 * The manager account is never touched — sign in with the one that already exists.
 */

const FIELD_EMAIL = "campo@motiva.com";

const BASE_LAT = -23.55;
const BASE_LON = -46.63;

type Db = DrizzleService["db"];

type SeedTeam = {
  name: string;
  baseLat: number;
  baseLng: number;
  kmStart: number;
  kmEnd: number;
  capacityPerDay: number;
};

type SeedSegment = {
  kmStart: number;
  kmEnd: number;
  mowingType: string;
  score: number;
  level: "attention" | "urgent" | "critical" | null;
};

const TEAMS: SeedTeam[] = [
  {
    name: "Equipe Norte",
    baseLat: BASE_LAT,
    baseLng: BASE_LON,
    kmStart: 0,
    kmEnd: 20,
    capacityPerDay: 3,
  },
  {
    name: "Equipe Sul",
    baseLat: BASE_LAT - 0.2,
    baseLng: BASE_LON - 0.2,
    kmStart: 20,
    kmEnd: 40,
    capacityPerDay: 2,
  },
];

const SEGMENTS: SeedSegment[] = [
  { kmStart: 10, kmEnd: 12, mowingType: "mecanizada", score: 82, level: "critical" },
  { kmStart: 12, kmEnd: 14, mowingType: "mecanizada", score: 68, level: "urgent" },
  { kmStart: 14, kmEnd: 16, mowingType: "manual", score: 45, level: "attention" },
  { kmStart: 16, kmEnd: 18, mowingType: "mecanizada", score: 21, level: null },
  { kmStart: 18, kmEnd: 20, mowingType: "manual", score: 74, level: "urgent" },
  { kmStart: 22, kmEnd: 24, mowingType: "mecanizada", score: 88, level: "critical" },
  { kmStart: 24, kmEnd: 26, mowingType: "mecanizada", score: 52, level: "attention" },
  { kmStart: 26, kmEnd: 28, mowingType: "manual", score: 15, level: null },
];

const READING_SOURCES = [
  { source: "iot", confidence: 0.9, offset: -4 },
  { source: "vehicle", confidence: 0.75, offset: 3 },
  { source: "satellite", confidence: 0.5, offset: -8 },
];

const ROAD = "BR-101";

function classificationFor(score: number): "ok" | "attention" | "urgent" {
  if (score >= 70) return "urgent";
  if (score >= 40) return "attention";
  return "ok";
}

async function ensureFieldUser(db: Db, password: string): Promise<string> {
  await db.execute(sql`
    INSERT INTO users (id, email, name, password, role)
    VALUES (gen_random_uuid(), ${FIELD_EMAIL}, 'Equipe de Campo', ${password}, 'field')
    ON CONFLICT (email) DO NOTHING
  `);

  const [row] = await db.execute<{ id: string }>(
    sql`SELECT id FROM users WHERE email = ${FIELD_EMAIL}`,
  );
  return row.id;
}

async function ensureTeam(db: Db, team: SeedTeam): Promise<string> {
  await db.execute(sql`
    INSERT INTO teams (id, name, base_lat, base_lng, road_name, km_start, km_end, capacity_per_day, active)
    SELECT gen_random_uuid(), ${team.name}, ${team.baseLat}, ${team.baseLng}, ${ROAD},
           ${team.kmStart}, ${team.kmEnd}, ${team.capacityPerDay}, true
    WHERE NOT EXISTS (SELECT 1 FROM teams WHERE name = ${team.name})
  `);

  const [row] = await db.execute<{ id: string }>(
    sql`SELECT id FROM teams WHERE name = ${team.name} LIMIT 1`,
  );
  return row.id;
}

async function ensureSegment(db: Db, segment: SeedSegment): Promise<string> {
  const lat = BASE_LAT + segment.kmStart * 0.001;
  const lon = BASE_LON + segment.kmStart * 0.001;

  await db.execute(sql`
    INSERT INTO road_segments (id, road_name, km_start, km_end, mowing_type, geometry, score_current, score_divergent)
    VALUES (
      gen_random_uuid(), ${ROAD}, ${segment.kmStart}, ${segment.kmEnd}, ${segment.mowingType},
      ST_SetSRID(ST_MakeLine(ST_MakePoint(${lon}, ${lat}), ST_MakePoint(${lon + 0.018}, ${lat + 0.018})), 4326),
      ${segment.score}, false
    )
    ON CONFLICT (road_name, km_start, km_end) DO NOTHING
  `);

  const [row] = await db.execute<{ id: string }>(sql`
    SELECT id FROM road_segments
    WHERE road_name = ${ROAD} AND km_start = ${segment.kmStart} AND km_end = ${segment.kmEnd}
  `);
  return row.id;
}

async function ensureReadings(db: Db, segmentId: string, segment: SeedSegment): Promise<void> {
  const lat = BASE_LAT + segment.kmStart * 0.001;
  const lon = BASE_LON + segment.kmStart * 0.001;

  for (const reading of READING_SOURCES) {
    const score = Math.min(100, Math.max(0, segment.score + reading.offset));

    await db.execute(sql`
      INSERT INTO readings (id, segment_id, source, height_cm, classification, confidence, score, lat, lon)
      SELECT gen_random_uuid(), ${segmentId}, ${reading.source}, ${Math.round(score * 0.8)},
             ${classificationFor(score)}, ${reading.confidence}, ${score}, ${lat}, ${lon}
      WHERE NOT EXISTS (
        SELECT 1 FROM readings WHERE segment_id = ${segmentId} AND source = ${reading.source}
      )
    `);
  }
}

/**
 * Reuses the open alert of the segment when there is one — the partial unique index
 * allows a single open alert per segment and level, and an environment with real
 * data may already have it.
 */
async function ensureAlertAndWorkOrder(
  db: Db,
  segmentId: string,
  segment: SeedSegment,
): Promise<void> {
  if (!segment.level) return;

  await db.execute(sql`
    INSERT INTO alerts (id, segment_id, level, score, channels)
    SELECT gen_random_uuid(), ${segmentId}, ${segment.level}, ${segment.score}, '["dashboard"]'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM alerts
      WHERE segment_id = ${segmentId} AND level = ${segment.level} AND closed_at IS NULL
    )
  `);

  const [alert] = await db.execute<{ id: string }>(sql`
    SELECT id FROM alerts
    WHERE segment_id = ${segmentId} AND level = ${segment.level} AND closed_at IS NULL
    LIMIT 1
  `);

  await db.execute(sql`
    INSERT INTO work_orders (id, segment_id, alert_id, status, priority, score_at_creation)
    VALUES (gen_random_uuid(), ${segmentId}, ${alert.id}, 'open', ${segment.level}, ${segment.score})
    ON CONFLICT (alert_id) DO NOTHING
  `);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && process.env.SEED_FORCE !== "1") {
    throw new Error("Refusing to seed a production database. Set SEED_FORCE=1 to override.");
  }

  if (isProduction && !process.env.SEED_PASSWORD) {
    throw new Error("Set SEED_PASSWORD to seed a production database — no default password.");
  }

  const drizzleService = new DrizzleService({ getOrThrow: () => url } as unknown as ConfigService);
  const db = drizzleService.db;

  const fieldPassword = process.env.SEED_PASSWORD ?? "motiva123";
  const fieldUserId = await ensureFieldUser(db, await argon2.hash(fieldPassword));

  const teamIds: string[] = [];
  for (const team of TEAMS) {
    teamIds.push(await ensureTeam(db, team));
  }

  // The field user joins the first team so the role-scoped views have data.
  await db.execute(sql`
    INSERT INTO team_members (id, team_id, user_id, role)
    VALUES (gen_random_uuid(), ${teamIds[0]}, ${fieldUserId}, 'member')
    ON CONFLICT (team_id, user_id) DO NOTHING
  `);

  for (const segment of SEGMENTS) {
    const segmentId = await ensureSegment(db, segment);
    await ensureReadings(db, segmentId, segment);
    await ensureAlertAndWorkOrder(db, segmentId, segment);
  }

  await new DispatchService(drizzleService).runDispatch();

  const [routes] = await db.execute<{ total: string }>(sql`SELECT COUNT(*) AS total FROM routes`);
  process.stdout.write(
    `Seed applied: ${SEGMENTS.length} segments, ${routes.total} routes. Field login: ${FIELD_EMAIL}. Sign in as manager with the account that already exists.\n`,
  );

  await drizzleService.onModuleDestroy();
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed failed: ${String(error)}\n`);
  process.exit(1);
});
