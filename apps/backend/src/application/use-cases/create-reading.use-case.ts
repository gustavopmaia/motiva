import { randomUUID } from "crypto";
import { Reading, ReadingClassification } from "@domain/entities/reading.entity";
import { ReadingRepository } from "@domain/repositories/reading.repository";
import { RoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { NotFoundError } from "@application/errors";
import { FusionService } from "@application/services/fusion.service";
import { CreateReadingInput } from "@application/types/readings.types";

const VEHICLE_SCORE: Record<ReadingClassification, number> = {
  ok: 10,
  attention: 50,
  urgent: 85,
};

export class CreateReadingUseCase {
  constructor(
    private readonly roadSegmentRepository: RoadSegmentRepository,
    private readonly readingRepository: ReadingRepository,
    private readonly fusionService: FusionService,
  ) {}

  async execute(input: CreateReadingInput): Promise<Reading> {
    const segment = await this.roadSegmentRepository.findByLocation(input.lat, input.lon);
    if (!segment) throw new NotFoundError("Road segment not found");

    const rawConfidence =
      input.confidence == null
        ? 1
        : input.confidence > 1
          ? input.confidence / 100
          : input.confidence;
    const confidence = clamp(rawConfidence, 0, 1);
    const score = Number(this.calculateScore(input, confidence).toFixed(2));
    const reading = new Reading(
      randomUUID(),
      segment.id,
      input.source,
      input.source === "iot" ? input.heightCm : null,
      input.source === "vehicle" ? input.classification : null,
      confidence,
      score,
      input.lat,
      input.lon,
      input.metadata ?? null,
      new Date(),
    );

    const saved = await this.readingRepository.save(reading);
    await this.fusionService.updateScoreForSegment(segment.id);

    return saved;
  }

  private calculateScore(input: CreateReadingInput, confidence: number) {
    if (input.source === "iot") {
      return clamp(input.heightCm * 1.4, 0, 100);
    }

    if (input.source === "vehicle") {
      return clamp(VEHICLE_SCORE[input.classification] * confidence, 0, 100);
    }

    return clamp((input.ndvi - 0.2) * 200, 0, 100);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
