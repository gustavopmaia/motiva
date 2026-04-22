import { Injectable } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { ReadingSource } from "@domain/entities/reading.entity";
import { IReadingRepository } from "@domain/repositories/reading.repository";
import { IRoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import {
  READING_CREATED_EVENT,
  ReadingCreatedEvent,
  SCORE_UPDATED_EVENT,
  ScoreUpdatedEvent,
} from "@application/events/readings.events";

const SOURCE_WEIGHTS: Record<ReadingSource, number> = {
  iot: 0.5,
  vehicle: 0.35,
  satellite: 0.15,
};

@Injectable()
export class FusionService {
  constructor(
    private readonly readingRepository: IReadingRepository,
    private readonly roadSegmentRepository: IRoadSegmentRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(READING_CREATED_EVENT)
  async onReadingCreated(event: ReadingCreatedEvent) {
    const segment = await this.roadSegmentRepository.findById(event.segmentId);
    if (!segment) return;

    const readings = await this.readingRepository.findLatestBySourceBySegmentSince(
      event.segmentId,
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );

    if (readings.length === 0) return;

    const totalWeight = readings.reduce((sum, reading) => sum + SOURCE_WEIGHTS[reading.source], 0);
    const currentScore = Number(
      readings
        .reduce(
          (sum, reading) => sum + reading.score * (SOURCE_WEIGHTS[reading.source] / totalWeight),
          0,
        )
        .toFixed(2),
    );
    const scores = readings.map((reading) => reading.score);
    const divergence = scores.length > 1 && Math.max(...scores) - Math.min(...scores) > 40;
    const previousScore = segment.scoreCurrent;

    await this.roadSegmentRepository.updateScore(event.segmentId, currentScore, divergence);

    const previous = previousScore ?? 0;
    const crossedThreshold = [30, 55, 80].some(
      (threshold) =>
        (previous < threshold && currentScore >= threshold) ||
        (previous >= threshold && currentScore < threshold),
    );
    if (!crossedThreshold) return;

    const scoreUpdatedEvent: ScoreUpdatedEvent = {
      segmentId: event.segmentId,
      previousScore,
      currentScore,
      divergence,
    };

    this.eventEmitter.emit(SCORE_UPDATED_EVENT, scoreUpdatedEvent);
  }
}
