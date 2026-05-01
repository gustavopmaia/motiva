import { CreateReadingUseCase } from "./create-reading.use-case";
import { RoadSegment } from "@domain/entities/road-segment.entity";
import { Reading } from "@domain/entities/reading.entity";
import { NotFoundError } from "@application/errors";

const seg = new RoadSegment("seg-1", "BR-101", 0, 1, null);

const makeRepos = (segment: RoadSegment | null = seg) => ({
  roadSegmentRepository: { findByLocation: jest.fn().mockResolvedValue(segment) },
  readingRepository: { save: jest.fn().mockImplementation((r: Reading) => Promise.resolve(r)) },
  fusionService: { updateScoreForSegment: jest.fn().mockResolvedValue(undefined) },
});

describe("CreateReadingUseCase", () => {
  it("deve calcular score de IoT como heightCm * 1.4 (clamped a 100)", async () => {
    const { roadSegmentRepository, readingRepository, fusionService } = makeRepos();
    const useCase = new CreateReadingUseCase(
      roadSegmentRepository as any,
      readingRepository as any,
      fusionService as any,
    );

    const result = await useCase.execute({ source: "iot", lat: 0, lon: 0, heightCm: 50 });

    expect(result.score).toBe(70); // 50 * 1.4
    expect(result.source).toBe("iot");
    expect(result.heightCm).toBe(50);
  });

  it("deve calcular score de vehicle como VEHICLE_SCORE[classification] * confidence", async () => {
    const { roadSegmentRepository, readingRepository, fusionService } = makeRepos();
    const useCase = new CreateReadingUseCase(
      roadSegmentRepository as any,
      readingRepository as any,
      fusionService as any,
    );

    // attention = 50, confidence = 0.8 → score = 40
    const result = await useCase.execute({
      source: "vehicle",
      lat: 0,
      lon: 0,
      classification: "attention",
      confidence: 0.8,
    });

    expect(result.score).toBe(40);
    expect(result.classification).toBe("attention");
  });

  it("deve lançar NotFoundError quando segmento não for encontrado", async () => {
    const { roadSegmentRepository, readingRepository, fusionService } = makeRepos(null);
    const useCase = new CreateReadingUseCase(
      roadSegmentRepository as any,
      readingRepository as any,
      fusionService as any,
    );

    await expect(
      useCase.execute({ source: "iot", lat: 99, lon: 99, heightCm: 10 }),
    ).rejects.toThrow(NotFoundError);
  });
});
