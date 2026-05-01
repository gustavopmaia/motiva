import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { ReadingSource } from "@domain/entities/reading.entity";
import { AlertLevel } from "@domain/entities/alert.entity";
import {
  DEFAULT_JOB_OPTIONS,
  SEGMENT_EVENTS_QUEUE,
  SEGMENT_RISK_LEVEL_CHANGED_JOB,
  ProcessReadingResultJob,
} from "@application/jobs/readings-queue.types";
import { DrizzleService } from "@infrastructure/database/drizzle.service";
import { roadSegments } from "@infrastructure/database/schema";
import { eq, sql } from "drizzle-orm";

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
    private readonly drizzle: DrizzleService,
    @InjectQueue(SEGMENT_EVENTS_QUEUE)
    private readonly readingsQueue: Queue,
  ) {}

  async updateScoreForSegment(segmentId: string, readingId: string) {
    const [segment] = await this.drizzle.db
      .select()
      .from(roadSegments)
      .where(eq(roadSegments.id, segmentId))
      .limit(1);
    if (!segment) return;

    const readings = await this.drizzle.db.execute<LatestReadingRow>(sql`
      SELECT DISTINCT ON (source)
        source,
        score
      FROM readings
      WHERE segment_id = ${segmentId}
        AND created_at >= ${new Date(Date.now() - 24 * 60 * 60 * 1000)}
      ORDER BY source, created_at DESC
    `);

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

    await this.drizzle.db
      .update(roadSegments)
      .set({ scoreCurrent: currentScore, scoreDivergent: divergence })
      .where(eq(roadSegments.id, segmentId));

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
    await this.readingsQueue.add(SEGMENT_RISK_LEVEL_CHANGED_JOB, job, {
      ...DEFAULT_JOB_OPTIONS,
      jobId: `${SEGMENT_RISK_LEVEL_CHANGED_JOB}:${segmentId}:${level}:${readingId}`,
    });
  }
}

type LatestReadingRow = {
  source: ReadingSource;
  score: number;
};
