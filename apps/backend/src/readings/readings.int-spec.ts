import { SegmentLocator } from "../road-segments/segment-locator";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../database/drizzle.service";
import { ReadingsService } from "./readings.service";
import { FusionService } from "./fusion.service";
import { NotFoundError } from "../common/errors";
import {
  createTestDrizzle,
  describeDb,
  insertSegment,
  migrateTestDb,
  truncateAll,
} from "../test-db";

describeDb("readings against a real PostGIS database", () => {
  let drizzle: DrizzleService;
  let readings: ReadingsService;
  let fusion: FusionService;

  beforeAll(async () => {
    drizzle = createTestDrizzle();
    await migrateTestDb(drizzle);
  }, 60_000);

  afterAll(async () => {
    await drizzle.onModuleDestroy();
  });

  beforeEach(async () => {
    await truncateAll(drizzle);
    fusion = new FusionService(drizzle);
    readings = new ReadingsService(
      drizzle,
      fusion,
      new SegmentLocator(drizzle, { get: () => 500 } as never),
    );
  });

  describe("segment matching with ST_Distance", () => {
    it("liga a leitura ao segmento geograficamente mais próximo", async () => {
      await insertSegment(drizzle, {
        id: "11111111-1111-4111-8111-111111111111",
        roadName: "BR-101",
        kmStart: 0,
        kmEnd: 1,
        lat: -23.55,
        lon: -46.63,
      });
      await insertSegment(drizzle, {
        id: "22222222-2222-4222-8222-222222222222",
        roadName: "BR-101",
        kmStart: 500,
        kmEnd: 501,
        lat: -3.1,
        lon: -60.0,
      });

      const reading = await readings.create({
        source: "iot",
        lat: -23.551,
        lon: -46.631,
        heightCm: 50,
      });

      expect(reading.segmentId).toBe("11111111-1111-4111-8111-111111111111");
      expect(reading.score).toBe(70);
    });

    it("lança NotFoundError quando não existe segmento algum", async () => {
      await expect(
        readings.create({ source: "iot", lat: 0, lon: 0, heightCm: 10 }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("fusion with DISTINCT ON (source)", () => {
    const segmentId = "33333333-3333-4333-8333-333333333333";

    beforeEach(async () => {
      await insertSegment(drizzle, {
        id: segmentId,
        roadName: "BR-101",
        kmStart: 0,
        kmEnd: 1,
        lat: -23.55,
        lon: -46.63,
      });
    });

    const addReading = (source: string, score: number, ageHours = 0) =>
      drizzle.db.execute(sql`
        INSERT INTO readings (id, segment_id, source, confidence, score, lat, lon, created_at)
        VALUES (gen_random_uuid(), ${segmentId}, ${source}, 1, ${score}, -23.55, -46.63,
                NOW() - (${ageHours} || ' hours')::interval)
      `);

    it("usa apenas a leitura mais recente de cada fonte", async () => {
      await addReading("iot", 10, 5);
      await addReading("iot", 90, 1);

      await fusion.updateScoreForSegment(segmentId, "r-1");

      const [row] = await drizzle.db.execute<{ score_current: number }>(
        sql`SELECT score_current FROM road_segments WHERE id = ${segmentId}`,
      );
      expect(row.score_current).toBe(90);
    });

    it("ignora leituras com mais de 24 horas", async () => {
      await addReading("iot", 90, 1);
      await addReading("vehicle", 10, 30);

      await fusion.updateScoreForSegment(segmentId, "r-1");

      const [row] = await drizzle.db.execute<{ score_current: number }>(
        sql`SELECT score_current FROM road_segments WHERE id = ${segmentId}`,
      );
      expect(row.score_current).toBe(90);
    });

    it("pondera as três fontes e marca divergência", async () => {
      await addReading("iot", 90, 1);
      await addReading("vehicle", 20, 1);
      await addReading("satellite", 30, 1);

      await fusion.updateScoreForSegment(segmentId, "r-1");

      const [row] = await drizzle.db.execute<{
        score_current: number;
        score_divergent: boolean;
      }>(sql`SELECT score_current, score_divergent FROM road_segments WHERE id = ${segmentId}`);

      expect(row.score_current).toBeCloseTo(0.5 * 90 + 0.35 * 20 + 0.15 * 30, 2);
      expect(row.score_divergent).toBe(true);
    });

    it("excludes old measurements after an intervention", async () => {
      await addReading("iot", 90, 1);
      await drizzle.db.execute(
        sql`UPDATE road_segments SET last_intervention_at = clock_timestamp() - interval '30 minutes' WHERE id = ${segmentId}`,
      );
      await addReading("satellite", 10, 0);
      await fusion.updateScoreForSegment(segmentId, "after-maintenance");
      const [row] = await drizzle.db.execute<{ score_current: number }>(
        sql`SELECT score_current FROM road_segments WHERE id = ${segmentId}`,
      );
      expect(row.score_current).toBe(10);
    });

    it("deduplicates simultaneous producer events", async () => {
      const input = {
        source: "iot" as const,
        lat: -23.55,
        lon: -46.63,
        heightCm: 60,
        originKey: "sensor:reading-1",
      };
      const results = await Promise.all([
        readings.create(input),
        readings.create(input),
        readings.create(input),
      ]);
      expect(new Set(results.map((row) => row.id)).size).toBe(1);
      expect(await drizzle.db.execute(sql`SELECT id FROM readings`)).toHaveLength(1);
      expect(await drizzle.db.execute(sql`SELECT id FROM outbox_events`)).toHaveLength(1);
    });

    it("rejects conflicting events even when both heights produce the same clamped score", async () => {
      const input = {
        source: "iot" as const,
        lat: -23.55,
        lon: -46.63,
        heightCm: 100,
        originKey: "sensor:reading-1",
      };
      await readings.create(input);
      await expect(readings.create({ ...input, heightCm: 200 })).rejects.toThrow(
        "different content",
      );
    });

    it("rejects future observations and ignores legacy future readings during fusion", async () => {
      await expect(
        readings.create({
          source: "iot",
          lat: -23.55,
          lon: -46.63,
          heightCm: 70,
          observedAt: new Date(Date.now() + 600_000),
        }),
      ).rejects.toThrow("5 minutes");
      await addReading("iot", 90, -48);
      await addReading("satellite", 20);
      await fusion.updateScoreForSegment(segmentId, "legacy-future");
      const [state] = await drizzle.db.execute<{ score_current: number }>(
        sql`SELECT score_current FROM road_segments WHERE id = ${segmentId}`,
      );
      expect(state.score_current).toBe(20);
    });

    it("keeps contributor provenance and canonical producer metadata", async () => {
      const input = {
        source: "iot" as const,
        lat: -23.55,
        lon: -46.63,
        heightCm: 60,
        originKey: "sensor:canonical",
        metadata: { a: 1, b: { x: 2, y: 3 } },
      };
      const first = await readings.create(input);
      const second = await readings.create({ ...input, metadata: { b: { y: 3, x: 2 }, a: 1 } });
      expect(second.id).toBe(first.id);
      const [state] = await drizzle.db.execute<{
        risk_contributions: { readingId: string; source: string }[];
      }>(sql`SELECT risk_contributions FROM road_segments WHERE id = ${segmentId}`);
      expect(state.risk_contributions).toEqual([
        expect.objectContaining({ readingId: first.id, source: "iot" }),
      ]);
    });

    it("enfileira job ao cruzar threshold", async () => {
      await addReading("iot", 90, 1);

      await fusion.updateScoreForSegment(segmentId, "r-1");

      const [event] = await drizzle.db.execute<{ payload: { level: string; segmentId: string } }>(
        sql`SELECT payload FROM outbox_events WHERE type = 'segment.risk-level-changed'`,
      );
      expect(event.payload).toMatchObject({ level: "critical", segmentId });
    });
  });
});
