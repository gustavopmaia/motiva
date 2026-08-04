import { NotFoundError } from "../common/errors";
import { ReadingsService } from "./readings.service";

const savedReading = {
  id: "r-1",
  segmentId: "seg-1",
  source: "iot",
  heightCm: 50,
  classification: null,
  confidence: 1,
  score: 70,
  lat: 0,
  lon: 0,
  metadata: null,
  createdAt: new Date(),
};

const makeService = (segmentRows: { id: string }[] = [{ id: "seg-1" }]) => {
  const returning = jest.fn().mockResolvedValue([savedReading]);
  const values = jest.fn().mockReturnValue({ returning });
  const insert = jest.fn().mockReturnValue({ values });
  const drizzle = {
    db: {
      execute: jest.fn().mockResolvedValue(segmentRows),
      insert,
    },
  };
  const fusionService = { updateScoreForSegment: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new ReadingsService(drizzle as any, fusionService as any),
    drizzle,
    values,
    fusionService,
  };
};

describe("ReadingsService", () => {
  it("calcula score de IoT como heightCm * 1.4 e persiste a leitura", async () => {
    const { service, values, fusionService } = makeService();

    const result = await service.create({ source: "iot", lat: 0, lon: 0, heightCm: 50 });

    expect(result.score).toBe(70);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ score: 70, heightCm: 50 }));
    expect(fusionService.updateScoreForSegment).toHaveBeenCalledWith("seg-1", "r-1");
  });

  it("lança NotFoundError quando nenhum segmento é encontrado", async () => {
    const { service } = makeService([]);

    await expect(service.create({ source: "iot", lat: 99, lon: 99, heightCm: 10 })).rejects.toThrow(
      NotFoundError,
    );
  });
});
