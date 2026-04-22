import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { randomUUID } from "crypto";
import { Reading, ReadingClassification } from "@domain/entities/reading.entity";
import { IReadingRepository } from "@domain/repositories/reading.repository";
import { IRoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { READING_CREATED_EVENT } from "@application/events/readings.events";
import { CreateReadingInput } from "@application/types/readings.types";

@Injectable()
export class CreateReadingUseCase {
  constructor(
    private readonly roadSegmentRepository: IRoadSegmentRepository,
    private readonly readingRepository: IReadingRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(input: CreateReadingInput): Promise<Reading> {
    const segment = await this.roadSegmentRepository.findByLocation(input.lat, input.lon);
    if (!segment) throw new Error("Road segment not found");

    const rawConfidence =
      input.confidence == null
        ? 1
        : input.confidence > 1
          ? input.confidence / 100
          : input.confidence;
    const confidence = Math.max(0, Math.min(rawConfidence, 1));
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
    this.eventEmitter.emit(READING_CREATED_EVENT, { reading: saved, segmentId: segment.id });

    return saved;
  }

  private calculateScore(input: CreateReadingInput, confidence: number) {
    if (input.source === "iot") {
      return Math.max(0, Math.min(input.heightCm * 1.4, 100));
    }

    if (input.source === "vehicle") {
      const baseScoreByClassification: Record<ReadingClassification, number> = {
        ok: 10,
        attention: 50,
        urgent: 85,
      };

      return Math.max(
        0,
        Math.min(baseScoreByClassification[input.classification] * confidence, 100),
      );
    }

    return Math.max(0, Math.min((input.ndvi - 0.2) * 200, 100));
  }
}
