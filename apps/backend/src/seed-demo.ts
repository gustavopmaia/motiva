import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { extname, join } from "path";
import { DrizzleService } from "./database/drizzle.service";
import { compareExif, ExifData, SentPhotoData } from "./work-order-photos/exif-compare";
import { WORK_ORDER_LOCATIONS } from "./work-orders/work-order.entity";

/**
 * Popula dado de demonstracao pra gravar o video pra Motiva: pega OS que ja
 * estao abertas/em andamento no ambiente (dado real, nao fabrica alerta
 * novo) e completa a maioria delas com data retroativa (ultimos ~4 meses,
 * pra relatorio mensal ARTESP e anual ANTT terem volume) + uma foto do
 * dataset de treinamento (`DEMO_PHOTOS_DIR`) com metadados mockados —
 * essas fotos nao tem EXIF de verdade, entao os campos de comparacao sao
 * calculados via `compareExif` (a mesma funcao pura de producao) com
 * lat/lon/data sinteticos escolhidos pra dar o resultado desejado.
 *
 * Deixa de proposito algumas OS intocadas — completar essas AO VIVO durante
 * a gravacao, com foto de verdade, e a prova real de que o EXIF funciona.
 *
 * Roda contra qualquer ambiente com DATABASE_URL setado (local ou dentro do
 * pod, via kubectl exec). Idempotente o suficiente pra rodar 2x sem
 * duplicar (so mexe em OS que ainda estao open/in_progress).
 */

const LIVE_DEMO_COUNT = 3;
const MAX_DEMO_ROWS = 24;
const MONTHS_BACK = 4;

const DISTANCE_TOLERANCE_M = Number(process.env.WORK_ORDER_PHOTO_DISTANCE_TOLERANCE_M ?? 150);
const TIME_TOLERANCE_S = Number(process.env.WORK_ORDER_PHOTO_TIME_TOLERANCE_S ?? 86_400);

type Db = DrizzleService["db"];

type OpenWorkOrderRow = {
  id: string;
  segmentId: string;
  roadName: string;
  kmStart: string;
  kmEnd: string;
  lat: number;
  lon: number;
};

type DemoOutcome = "verified" | "suspicious" | "missing_exif" | "no_photo";

function pickOutcome(index: number): DemoOutcome {
  // distribuicao aproximada: maioria confirmada, uma fatia de cada caso de
  // atencao — pra coluna Evidencia do relatorio mostrar todas as cores.
  const bucket = index % 10;
  if (bucket < 6) return "verified";
  if (bucket < 8) return "suspicious";
  if (bucket === 8) return "missing_exif";
  return "no_photo";
}

function randomPastDate(): Date {
  const now = Date.now();
  const msBack = MONTHS_BACK * 30 * 24 * 60 * 60 * 1000;
  const minAgo = 2 * 24 * 60 * 60 * 1000; // nunca hoje/ontem — isso fica pro demo ao vivo
  const offset = minAgo + Math.random() * (msBack - minAgo);
  return new Date(now - offset);
}

function jitter(value: number, maxDegrees: number): number {
  return value + (Math.random() * 2 - 1) * maxDegrees;
}

function buildExifFor(outcome: DemoOutcome, sent: SentPhotoData): ExifData {
  if (outcome === "missing_exif" || outcome === "no_photo") return null;

  if (outcome === "verified") {
    return {
      lat: jitter(sent.lat, 0.0005), // ~50m, dentro da tolerancia de 150m
      lon: jitter(sent.lon, 0.0005),
      capturedAt: new Date(sent.capturedAt.getTime() + 5 * 60 * 1000), // 5 min depois
    };
  }

  // suspicious: local do exif bem longe do reportado
  return {
    lat: jitter(sent.lat, 0.02), // ~2km, acima da tolerancia
    lon: jitter(sent.lon, 0.02),
    capturedAt: sent.capturedAt,
  };
}

async function findOpenWorkOrders(db: Db): Promise<OpenWorkOrderRow[]> {
  return db.execute<OpenWorkOrderRow>(sql`
    SELECT wo.id, wo.segment_id AS "segmentId",
           rs.road_name AS "roadName", rs.km_start AS "kmStart", rs.km_end AS "kmEnd",
           ST_Y(ST_StartPoint(rs.geometry)) AS lat, ST_X(ST_StartPoint(rs.geometry)) AS lon
    FROM work_orders wo
    JOIN road_segments rs ON rs.id = wo.segment_id
    WHERE wo.status IN ('open', 'in_progress')
    ORDER BY wo.created_at
    LIMIT ${MAX_DEMO_ROWS}
  `);
}

async function completeWithDemoData(
  db: Db,
  storageDir: string,
  photoFiles: string[],
  row: OpenWorkOrderRow,
  outcome: DemoOutcome,
  photoIndex: number,
): Promise<void> {
  const completedAt = randomPastDate();
  const startedAt = new Date(completedAt.getTime() - 2 * 24 * 60 * 60 * 1000);
  const location = WORK_ORDER_LOCATIONS[photoIndex % WORK_ORDER_LOCATIONS.length];

  await db.execute(sql`
    UPDATE work_orders
    SET status = 'completed', started_at = ${startedAt}, completed_at = ${completedAt}, location = ${location}
    WHERE id = ${row.id}
  `);
  await db.execute(sql`
    UPDATE work_orders
    SET status = 'completed', completed_at = ${completedAt}
    WHERE segment_id = ${row.segmentId} AND id != ${row.id} AND status != 'completed'
  `);
  await db.execute(sql`
    UPDATE road_segments SET score_current = 0, score_divergent = false WHERE id = ${row.segmentId}
  `);
  await db.execute(sql`
    UPDATE alerts SET closed_at = ${completedAt}
    WHERE segment_id = ${row.segmentId} AND closed_at IS NULL
  `);

  if (outcome === "no_photo") return;

  const sourceFile = photoFiles[photoIndex % photoFiles.length];
  const sent: SentPhotoData = { lat: row.lat, lon: row.lon, capturedAt: completedAt };
  const exif = buildExifFor(outcome, sent);
  const compared = compareExif(sent, exif, DISTANCE_TOLERANCE_M, TIME_TOLERANCE_S);

  const id = randomUUID();
  const photoPath = `${id}.jpg`;
  copyFileSync(sourceFile, join(storageDir, photoPath));
  const photoHash = createHash("sha256").update(readFileSync(sourceFile)).digest("hex");

  await db.execute(sql`
    INSERT INTO work_order_photos (
      id, work_order_id, photo_path, photo_hash, lat, lon, captured_at,
      exif_lat, exif_lon, exif_captured_at, validation_status, distance_meters, time_diff_seconds
    ) VALUES (
      ${id}, ${row.id}, ${photoPath}, ${photoHash}, ${sent.lat}, ${sent.lon}, ${sent.capturedAt},
      ${exif?.lat ?? null}, ${exif?.lon ?? null}, ${exif?.capturedAt ?? null},
      ${compared.status}, ${compared.distanceMeters}, ${compared.timeDiffSeconds}
    )
  `);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const demoPhotosDir = process.env.DEMO_PHOTOS_DIR;
  if (!demoPhotosDir) throw new Error("DEMO_PHOTOS_DIR is not set (dataset de fotos fake)");

  const storageDir = process.env.WORK_ORDER_PHOTOS_DIR ?? "/data/work-order-photos";
  mkdirSync(storageDir, { recursive: true });

  const photoFiles = readdirSync(demoPhotosDir)
    .filter((name) => [".jpg", ".jpeg"].includes(extname(name).toLowerCase()))
    .map((name) => join(demoPhotosDir, name));
  if (photoFiles.length === 0) throw new Error(`Nenhum JPEG encontrado em ${demoPhotosDir}`);

  const drizzleService = new DrizzleService({
    getOrThrow: () => databaseUrl,
  } as unknown as ConfigService);
  const db = drizzleService.db;

  const openWorkOrders = await findOpenWorkOrders(db);
  if (openWorkOrders.length === 0) {
    process.stdout.write("Nenhuma OS aberta encontrada — nada pra popular.\n");
    await drizzleService.onModuleDestroy();
    return;
  }

  const liveCount = Math.min(LIVE_DEMO_COUNT, Math.max(0, openWorkOrders.length - 1));
  const toBackdate = openWorkOrders.slice(0, openWorkOrders.length - liveCount);
  const liveDemo = openWorkOrders.slice(openWorkOrders.length - liveCount);

  let index = 0;
  for (const row of toBackdate) {
    const outcome = pickOutcome(index);
    await completeWithDemoData(db, storageDir, photoFiles, row, outcome, index);
    process.stdout.write(
      `completada: ${row.roadName} km ${row.kmStart}-${row.kmEnd} -> ${outcome}\n`,
    );
    index += 1;
  }

  process.stdout.write(`\n${toBackdate.length} OS completadas com dado retroativo.\n\n`);
  process.stdout.write("Complete estas AO VIVO durante a gravacao (com foto de verdade):\n");
  for (const row of liveDemo) {
    process.stdout.write(`  - ${row.id} | ${row.roadName} km ${row.kmStart}-${row.kmEnd}\n`);
  }

  await drizzleService.onModuleDestroy();
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed demo falhou: ${String(error)}\n`);
  process.exit(1);
});
