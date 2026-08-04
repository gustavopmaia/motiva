import { FusionService } from "./fusion.service";
import { Reading } from "./reading.entity";
import { RoadSegment } from "../road-segments/road-segment.entity";
import { DEFAULT_JOB_OPTIONS, SEGMENT_RISK_LEVEL_CHANGED_JOB } from "../common/queues";

const seg = (score: number | null = null): RoadSegment => ({
  id: "seg-1",
  roadName: "BR-101",
  kmStart: 0,
  kmEnd: 1,
  mowingType: null,
  scoreCurrent: score,
  scoreDivergent: false,
});

const reading = (source: "iot" | "vehicle" | "satellite", score: number): Reading => ({
  id: "r-1",
  segmentId: "seg-1",
  source,
  heightCm: null,
  classification: null,
  confidence: 1,
  score,
  lat: 0,
  lon: 0,
  metadata: null,
  createdAt: new Date(),
});

const makeService = (readings: Reading[], segment: RoadSegment | null = seg()) => {
  const whereSegment = jest
    .fn()
    .mockReturnValue({ limit: jest.fn().mockResolvedValue(segment ? [segment] : []) });
  const select = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({ where: whereSegment }),
  });
  const whereUpdate = jest.fn().mockResolvedValue(undefined);
  const set = jest.fn().mockReturnValue({ where: whereUpdate });
  const update = jest.fn().mockReturnValue({ set });
  const drizzle = {
    db: {
      select,
      execute: jest.fn().mockResolvedValue(readings),
      update,
    },
  };
  const readingsQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const service = new (FusionService as any)(drizzle, readingsQueue);
  return { service, drizzle, set, readingsQueue };
};

describe("FusionService", () => {
  it("deve ponderar corretamente com as 3 fontes presentes e cruzar threshold", async () => {
    const readings = [reading("iot", 60), reading("vehicle", 60), reading("satellite", 60)];
    const { service, readingsQueue } = makeService(readings, seg(0));

    await service.updateScoreForSegment("seg-1", "r-1");

    expect(readingsQueue.add).toHaveBeenCalledWith(
      SEGMENT_RISK_LEVEL_CHANGED_JOB,
      expect.objectContaining({ score: 60, level: "urgent" }),
      expect.objectContaining(DEFAULT_JOB_OPTIONS),
    );
  });

  it("deve normalizar pesos quando apenas uma fonte está presente", async () => {
    const { service, readingsQueue, set } = makeService([reading("iot", 40)], seg(0));

    await service.updateScoreForSegment("seg-1", "r-1");

    expect(set).toHaveBeenCalledWith({ scoreCurrent: 40, scoreDivergent: false });
    expect(readingsQueue.add).toHaveBeenCalledWith(
      SEGMENT_RISK_LEVEL_CHANGED_JOB,
      expect.objectContaining({ level: "attention" }),
      expect.objectContaining(DEFAULT_JOB_OPTIONS),
    );
  });

  it("não deve enfileirar job quando score não cruza nenhum threshold", async () => {
    const { service, readingsQueue } = makeService([reading("iot", 60)], seg(60));

    await service.updateScoreForSegment("seg-1", "r-1");

    expect(readingsQueue.add).not.toHaveBeenCalled();
  });
});
