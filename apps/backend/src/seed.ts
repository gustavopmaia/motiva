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
 * Idempotent — every row has a fixed id and conflicts are ignored, so running it
 * twice changes nothing.
 */

const PASSWORD = process.env.SEED_PASSWORD ?? "motiva123";

const TEAM_NORTE = "11111111-1111-4111-8111-000000000001";
const TEAM_SUL = "11111111-1111-4111-8111-000000000002";
const MANAGER = "22222222-2222-4222-8222-000000000001";
const FIELD = "22222222-2222-4222-8222-000000000002";

const BASE_LAT = -23.55;
const BASE_LON = -46.63;

type SeedSegment = {
  id: string;
  kmStart: number;
  kmEnd: number;
  mowingType: string;
  score: number;
  level: "attention" | "urgent" | "critical" | null;
};

const SEGMENTS: SeedSegment[] = [
  {
    id: seedId("33", 1),
    kmStart: 10,
    kmEnd: 12,
    mowingType: "mecanizada",
    score: 82,
    level: "critical",
  },
  {
    id: seedId("33", 2),
    kmStart: 12,
    kmEnd: 14,
    mowingType: "mecanizada",
    score: 68,
    level: "urgent",
  },
  {
    id: seedId("33", 3),
    kmStart: 14,
    kmEnd: 16,
    mowingType: "manual",
    score: 45,
    level: "attention",
  },
  { id: seedId("33", 4), kmStart: 16, kmEnd: 18, mowingType: "mecanizada", score: 21, level: null },
  { id: seedId("33", 5), kmStart: 18, kmEnd: 20, mowingType: "manual", score: 74, level: "urgent" },
  {
    id: seedId("33", 6),
    kmStart: 22,
    kmEnd: 24,
    mowingType: "mecanizada",
    score: 88,
    level: "critical",
  },
  {
    id: seedId("33", 7),
    kmStart: 24,
    kmEnd: 26,
    mowingType: "mecanizada",
    score: 52,
    level: "attention",
  },
  { id: seedId("33", 8), kmStart: 26, kmEnd: 28, mowingType: "manual", score: 15, level: null },
];

const READING_SOURCES = [
  { source: "iot", confidence: 0.9, offset: -4 },
  { source: "vehicle", confidence: 0.75, offset: 3 },
  { source: "satellite", confidence: 0.5, offset: -8 },
];

function seedId(prefix: string, index: number): string {
  return `${prefix.repeat(4)}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function classificationFor(score: number): "ok" | "attention" | "urgent" {
  if (score >= 70) return "urgent";
  if (score >= 40) return "attention";
  return "ok";
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "1") {
    throw new Error("Refusing to seed a production database. Set SEED_FORCE=1 to override.");
  }

  const drizzleService = new DrizzleService({ getOrThrow: () => url } as unknown as ConfigService);
  const db = drizzleService.db;
  const password = await argon2.hash(PASSWORD);

  await db.execute(sql`
    INSERT INTO users (id, email, name, password, role) VALUES
      (${MANAGER}, 'gestor@motiva.com', 'Gestor Motiva', ${password}, 'manager'),
      (${FIELD}, 'campo@motiva.com', 'Equipe de Campo', ${password}, 'field')
    ON CONFLICT (email) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO teams (id, name, base_lat, base_lng, road_name, km_start, km_end, capacity_per_day, active) VALUES
      (${TEAM_NORTE}, 'Equipe Norte', ${BASE_LAT}, ${BASE_LON}, 'BR-101', 0, 20, 3, true),
      (${TEAM_SUL}, 'Equipe Sul', ${BASE_LAT - 0.2}, ${BASE_LON - 0.2}, 'BR-101', 20, 40, 2, true)
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO team_members (id, team_id, user_id, role)
    VALUES (${seedId("44", 1)}, ${TEAM_NORTE}, ${FIELD}, 'member')
    ON CONFLICT (team_id, user_id) DO NOTHING
  `);

  for (const segment of SEGMENTS) {
    const lat = BASE_LAT + segment.kmStart * 0.001;
    const lon = BASE_LON + segment.kmStart * 0.001;

    await db.execute(sql`
      INSERT INTO road_segments (id, road_name, km_start, km_end, mowing_type, geometry, score_current, score_divergent)
      VALUES (
        ${segment.id}, 'BR-101', ${segment.kmStart}, ${segment.kmEnd}, ${segment.mowingType},
        ST_SetSRID(ST_MakeLine(ST_MakePoint(${lon}, ${lat}), ST_MakePoint(${lon + 0.018}, ${lat + 0.018})), 4326),
        ${segment.score}, false
      )
      ON CONFLICT (road_name, km_start, km_end) DO NOTHING
    `);

    for (const [index, reading] of READING_SOURCES.entries()) {
      const score = Math.min(100, Math.max(0, segment.score + reading.offset));

      await db.execute(sql`
        INSERT INTO readings (id, segment_id, source, height_cm, classification, confidence, score, lat, lon)
        VALUES (
          ${seedId("55", SEGMENTS.indexOf(segment) * 10 + index + 1)}, ${segment.id},
          ${reading.source}, ${Math.round(score * 0.8)}, ${classificationFor(score)},
          ${reading.confidence}, ${score}, ${lat}, ${lon}
        )
        ON CONFLICT (id) DO NOTHING
      `);
    }
  }

  for (const [index, segment] of SEGMENTS.entries()) {
    if (!segment.level) continue;

    const alertId = seedId("66", index + 1);

    await db.execute(sql`
      INSERT INTO alerts (id, segment_id, level, score, channels)
      VALUES (${alertId}, ${segment.id}, ${segment.level}, ${segment.score}, '["dashboard"]'::jsonb)
      ON CONFLICT DO NOTHING
    `);

    await db.execute(sql`
      INSERT INTO work_orders (id, segment_id, alert_id, status, priority, score_at_creation)
      VALUES (
        ${seedId("77", index + 1)}, ${segment.id}, ${alertId}, 'open',
        ${segment.level}, ${segment.score}
      )
      ON CONFLICT DO NOTHING
    `);
  }

  await new DispatchService(drizzleService).runDispatch();

  const [routes] = await db.execute<{ total: string }>(sql`SELECT COUNT(*) AS total FROM routes`);
  process.stdout.write(
    `Seed applied: ${SEGMENTS.length} segments, ${routes.total} routes. Login: gestor@motiva.com / campo@motiva.com (senha ${PASSWORD})\n`,
  );

  await drizzleService.onModuleDestroy();
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed failed: ${String(error)}\n`);
  process.exit(1);
});
