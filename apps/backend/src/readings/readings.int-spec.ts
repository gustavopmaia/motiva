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
  const queue = { add: jest.fn() };

  beforeAll(async () => {
    drizzle = createTestDrizzle();
    await migrateTestDb(drizzle);
  }, 60_000);

  afterAll(async () => {
    await drizzle.onModuleDestroy();
  });

  beforeEach(async () => {
    await truncateAll(drizzle);
    queue.add.mockReset();
    fusion = new FusionService(drizzle, queue as never);
    readings = new ReadingsService(drizzle, fusion);
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

    it("enfileira job ao cruzar threshold", async () => {
      await addReading("iot", 90, 1);

      await fusion.updateScoreForSegment(segmentId, "r-1");

      expect(queue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ level: "critical", segmentId }),
        expect.objectContaining({ jobId: expect.any(String) }),
      );
    });
  });
});
