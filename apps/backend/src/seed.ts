import * as argon2 from "argon2";
import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";
import { DispatchService } from "./work-orders/dispatch.service";
import { DrizzleService } from "./database/drizzle.service";

/**
 * Demo data for the Motiva presentation: field user, teams covering the road,
 * fused scores, readings from the three sources, open alerts, work orders, and
 * the routes the dispatch job builds out of them.
 *
 * It works on top of the road segments already imported — it picks the road with
 * the most segments and reuses them, so the demo runs over the real geometry
 * instead of a parallel set of made-up ones. Only when the database has no
 * segments at all (a fresh local checkout) does it create the fallback road.
 *
 * Everything is resolved by natural key (team name, user email, segment km range)
 * and every write is conditional, so running it twice changes nothing and running
 * it over real data adds to it rather than overwriting it.
 *
 * The manager account is never touched — sign in with the one that already exists.
 */

const FIELD_EMAIL = "campo@motiva.com";

/** Only used when the database has no road segments at all. */
const FALLBACK_ROAD = "BR-101";
const FALLBACK_BASE_LAT = -23.55;
const FALLBACK_BASE_LON = -46.63;
const FALLBACK_SEGMENT_COUNT = 12;

/** How many segments get a score high enough to open an alert. */
const SEGMENTS_WITH_ALERT = 8;

const LEVELS = ["critical", "urgent", "attention"] as const;
const SCORE_BY_LEVEL = { critical: 88, urgent: 71, attention: 47 } as const;

const READING_SOURCES = [
  { source: "iot", confidence: 0.9, offset: -4 },
  { source: "vehicle", confidence: 0.75, offset: 3 },
  { source: "satellite", confidence: 0.5, offset: -8 },
];

type Db = DrizzleService["db"];

type Level = (typeof LEVELS)[number];

type Segment = {
  id: string;
  kmStart: number;
  kmEnd: number;
  lat: number;
  lon: number;
};

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

/** The road already imported, or the fallback one when the database is empty. */
async function resolveRoad(db: Db): Promise<string> {
  const [busiest] = await db.execute<{ roadName: string }>(sql`
    SELECT road_name AS "roadName"
    FROM road_segments
    GROUP BY road_name
    ORDER BY count(*) DESC
    LIMIT 1
  `);

  if (busiest) return busiest.roadName;

  for (let index = 0; index < FALLBACK_SEGMENT_COUNT; index += 1) {
    const kmStart = index * 2;
    const lat = FALLBACK_BASE_LAT + kmStart * 0.001;
    const lon = FALLBACK_BASE_LON + kmStart * 0.001;

    await db.execute(sql`
      INSERT INTO road_segments (id, road_name, km_start, km_end, mowing_type, geometry)
      VALUES (
        gen_random_uuid(), ${FALLBACK_ROAD}, ${kmStart}, ${kmStart + 2},
        ${index % 2 === 0 ? "mecanizada" : "manual"},
        ST_SetSRID(ST_MakeLine(ST_MakePoint(${lon}, ${lat}), ST_MakePoint(${lon + 0.018}, ${lat + 0.018})), 4326)
      )
      ON CONFLICT (road_name, km_start, km_end) DO NOTHING
    `);
  }

  return FALLBACK_ROAD;
}

async function findSegments(db: Db, road: string): Promise<Segment[]> {
  const rows = await db.execute<{
    id: string;
    kmStart: string;
    kmEnd: string;
    lat: number;
    lon: number;
  }>(sql`
    SELECT id, km_start AS "kmStart", km_end AS "kmEnd",
           ST_Y(ST_StartPoint(geometry)) AS lat, ST_X(ST_StartPoint(geometry)) AS lon
    FROM road_segments
    WHERE road_name = ${road}
    ORDER BY km_start
  `);

  return rows.map((row) => ({
    id: row.id,
    kmStart: Number(row.kmStart),
    kmEnd: Number(row.kmEnd),
    lat: row.lat,
    lon: row.lon,
  }));
}

/**
 * Two teams splitting the road in half, so the dispatch job has someone to assign
 * every segment to and the field user sees a territory-scoped slice of the data.
 */
async function ensureTeams(db: Db, road: string, segments: Segment[]): Promise<string[]> {
  const kmStart = segments[0].kmStart;
  const kmEnd = segments[segments.length - 1].kmEnd;
  const middle = kmStart + (kmEnd - kmStart) / 2;

  const teams = [
    { name: "Equipe Norte", kmStart, kmEnd: middle, capacity: 3 },
    { name: "Equipe Sul", kmStart: middle, kmEnd, capacity: 2 },
  ];

  const ids: string[] = [];

  for (const team of teams) {
    const base = segments.find((segment) => segment.kmStart >= team.kmStart) ?? segments[0];

    await db.execute(sql`
      INSERT INTO teams (id, name, base_lat, base_lng, road_name, km_start, km_end, capacity_per_day, active)
      SELECT gen_random_uuid(), ${team.name}, ${base.lat}, ${base.lon}, ${road},
             ${team.kmStart}, ${team.kmEnd}, ${team.capacity}, true
      WHERE NOT EXISTS (SELECT 1 FROM teams WHERE name = ${team.name})
    `);

    const [row] = await db.execute<{ id: string }>(
      sql`SELECT id FROM teams WHERE name = ${team.name} LIMIT 1`,
    );
    ids.push(row.id);
  }

  return ids;
}

/** Spreads the alerting segments along the road instead of bunching them at the start. */
function pickAlertingSegments(segments: Segment[]): { segment: Segment; level: Level }[] {
  const total = Math.min(SEGMENTS_WITH_ALERT, segments.length);
  const step = Math.max(1, Math.floor(segments.length / total));

  return Array.from({ length: total }, (_, index) => ({
    segment: segments[index * step],
    level: LEVELS[index % LEVELS.length],
  }));
}

async function ensureReadings(db: Db, segment: Segment, score: number): Promise<void> {
  for (const reading of READING_SOURCES) {
    const sourceScore = Math.min(100, Math.max(0, score + reading.offset));

    await db.execute(sql`
      INSERT INTO readings (id, segment_id, source, height_cm, classification, confidence, score, lat, lon)
      SELECT gen_random_uuid(), ${segment.id}, ${reading.source}, ${Math.round(sourceScore * 0.8)},
             ${classificationFor(sourceScore)}, ${reading.confidence}, ${sourceScore},
             ${segment.lat}, ${segment.lon}
      WHERE NOT EXISTS (
        SELECT 1 FROM readings WHERE segment_id = ${segment.id} AND source = ${reading.source}
      )
    `);
  }
}

/**
 * Reuses the open alert of the segment when there is one — the partial unique index
 * allows a single open alert per segment and level, and a real environment may
 * already have opened it.
 */
async function ensureAlertAndWorkOrder(
  db: Db,
  segment: Segment,
  level: Level,
  score: number,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO alerts (id, segment_id, level, score, channels)
    SELECT gen_random_uuid(), ${segment.id}, ${level}, ${score}, '["dashboard"]'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM alerts
      WHERE segment_id = ${segment.id} AND level = ${level} AND closed_at IS NULL
    )
  `);

  const [alert] = await db.execute<{ id: string }>(sql`
    SELECT id FROM alerts
    WHERE segment_id = ${segment.id} AND level = ${level} AND closed_at IS NULL
    LIMIT 1
  `);

  await db.execute(sql`
    INSERT INTO work_orders (id, segment_id, alert_id, status, priority, score_at_creation)
    VALUES (gen_random_uuid(), ${segment.id}, ${alert.id}, 'open', ${level}, ${score})
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

  const road = await resolveRoad(db);
  const segments = await findSegments(db, road);
  if (segments.length === 0) throw new Error(`No road segments found for ${road}`);

  const teamIds = await ensureTeams(db, road, segments);

  // The field user joins the first team so the role-scoped views have data.
  await db.execute(sql`
    INSERT INTO team_members (id, team_id, user_id, role)
    VALUES (gen_random_uuid(), ${teamIds[0]}, ${fieldUserId}, 'member')
    ON CONFLICT (team_id, user_id) DO NOTHING
  `);

  for (const { segment, level } of pickAlertingSegments(segments)) {
    const score = SCORE_BY_LEVEL[level];

    // Never overwrites a score that the fusion pipeline already computed.
    await db.execute(sql`
      UPDATE road_segments SET score_current = ${score}
      WHERE id = ${segment.id} AND score_current IS NULL
    `);

    await ensureReadings(db, segment, score);
    await ensureAlertAndWorkOrder(db, segment, level, score);
  }

  await new DispatchService(drizzleService).runDispatch();

  const [totals] = await db.execute<{ routes: string; items: string }>(sql`
    SELECT
      (SELECT count(*) FROM routes) AS routes,
      (SELECT count(*) FROM route_items) AS items
  `);

  process.stdout.write(
    `Seed applied on ${road}: ${segments.length} segments, ${totals.routes} routes, ${totals.items} stops. ` +
      `Field login: ${FIELD_EMAIL}. Sign in as manager with the account that already exists.\n`,
  );

  await drizzleService.onModuleDestroy();
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed failed: ${String(error)}\n`);
  process.exit(1);
});
