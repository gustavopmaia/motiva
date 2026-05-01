import { FusionService } from "./fusion.service";
import { Reading } from "@domain/entities/reading.entity";
import { RoadSegment } from "@domain/entities/road-segment.entity";

const seg = (score: number | null = null) => new RoadSegment("seg-1", "BR-101", 0, 1, null, score);

const reading = (source: "iot" | "vehicle" | "satellite", score: number): Reading =>
  new Reading("r-1", "seg-1", source, null, null, 1, score, 0, 0, null);

const makeService = (readings: Reading[], segment: RoadSegment | null = seg()) => {
  const readingRepository = {
    findLatestBySourceBySegmentSince: jest.fn().mockResolvedValue(readings),
  };
  const roadSegmentRepository = {
    findById: jest.fn().mockResolvedValue(segment),
    updateScore: jest.fn().mockResolvedValue(undefined),
  };
  const readingsQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const service = new (FusionService as any)(
    readingRepository,
    roadSegmentRepository,
    readingsQueue,
  );
  return { service, readingRepository, roadSegmentRepository, readingsQueue };
};

describe("FusionService", () => {
  it("deve ponderar corretamente com as 3 fontes presentes e cruzar threshold", async () => {
    // iot=60 (peso 0.5), vehicle=60 (peso 0.35), satellite=60 (peso 0.15) → score=60, cruza threshold 55
    const readings = [reading("iot", 60), reading("vehicle", 60), reading("satellite", 60)];
    const { service, readingsQueue } = makeService(readings, seg(0));

    await service.updateScoreForSegment("seg-1", "r-1");

    expect(readingsQueue.add).toHaveBeenCalledWith(
      "process-reading-result",
      expect.objectContaining({ score: 60, level: "urgent" }),
    );
  });

  it("deve normalizar pesos quando apenas uma fonte está presente", async () => {
    // só iot com score 40 → peso normalizado = 1.0 → score = 40, cruza threshold 30
    const { service, readingsQueue, roadSegmentRepository } = makeService(
      [reading("iot", 40)],
      seg(0),
    );

    await service.updateScoreForSegment("seg-1", "r-1");

    expect(roadSegmentRepository.updateScore).toHaveBeenCalledWith("seg-1", 40, false);
    expect(readingsQueue.add).toHaveBeenCalledWith(
      "process-reading-result",
      expect.objectContaining({ level: "attention" }),
    );
  });

  it("não deve enfileirar job quando score não cruza nenhum threshold", async () => {
    // score permanece em 60, sem cruzamento
    const { service, readingsQueue } = makeService([reading("iot", 60)], seg(60));

    await service.updateScoreForSegment("seg-1", "r-1");

    expect(readingsQueue.add).not.toHaveBeenCalled();
  });
});
