import { Inject, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { ReadingSource } from "@domain/entities/reading.entity";
import { ReadingRepository } from "@domain/repositories/reading.repository";
import { RoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { AlertLevel } from "@domain/entities/alert.entity";
import { READINGS_QUEUE, ProcessReadingResultJob } from "@application/jobs/readings-queue.types";

const SOURCE_WEIGHTS: Record<ReadingSource, number> = {
  iot: 0.5,
  vehicle: 0.35,
  satellite: 0.15,
};
const SCORE_THRESHOLDS = [30, 55, 80];

function scoreToLevel(score: number): AlertLevel | null {
  if (score >= 80) return "critical";
  if (score >= 55) return "urgent";
  if (score >= 30) return "attention";
  return null;
}

@Injectable()
export class FusionService {
  constructor(
    @Inject(ReadingRepository)
    private readonly readingRepository: ReadingRepository,
    @Inject(RoadSegmentRepository)
    private readonly roadSegmentRepository: RoadSegmentRepository,
    @InjectQueue(READINGS_QUEUE)
    private readonly readingsQueue: Queue,
  ) {}

  async updateScoreForSegment(segmentId: string, readingId: string) {
    const segment = await this.roadSegmentRepository.findById(segmentId);
    if (!segment) return;

    const readings = await this.readingRepository.findLatestBySourceBySegmentSince(
      segmentId,
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

    await this.roadSegmentRepository.updateScore(segmentId, currentScore, divergence);

    const previous = previousScore ?? 0;
    const crossedThreshold = SCORE_THRESHOLDS.some(
      (threshold) =>
        (previous < threshold && currentScore >= threshold) ||
        (previous >= threshold && currentScore < threshold),
    );
    if (!crossedThreshold) return;

    const level = scoreToLevel(currentScore);
    if (!level) return;

    const job: ProcessReadingResultJob = { segmentId, score: currentScore, level, readingId };
    await this.readingsQueue.add("process-reading-result", job);
  }
}
