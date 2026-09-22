import { sql } from "drizzle-orm";
import { DrizzleService } from "../../../database/drizzle.service";
import { SEGMENT_EVENTS_QUEUE, SEGMENT_RISK_LEVEL_CHANGED_JOB } from "../../../common/queues";
import { Transaction } from "../../../platform/persistence/transaction";
import { appendEvent } from "../../../platform/messaging/outbox";
import {
  fuse,
  riskLevel,
  crossedRiskThreshold,
  RISK_POLICY_VERSION,
  Source,
} from "../domain/risk-policy";
import { latestRiskContributions } from "./risk-queries";

export class DrizzleRiskFusion {
  constructor(private readonly drizzle: DrizzleService) {}

  async updateScoreForSegment(
    segmentId: string,
    readingId: string,
    transaction?: Transaction,
  ): Promise<void> {
    if (!transaction)
      return this.drizzle.transaction((tx) => this.updateScoreForSegment(segmentId, readingId, tx));
    const tx = transaction;
    const [segment] = await tx.execute<{
      score_current: number | null;
      last_intervention_at: Date | string | null;
    }>(sql`
      SELECT score_current, last_intervention_at FROM road_segments WHERE id = ${segmentId} FOR UPDATE
    `);
    if (!segment) return;
    const interventionAt = segment.last_intervention_at
      ? new Date(segment.last_intervention_at).toISOString()
      : null;
    const readings = await tx.execute<{
      source: Source;
      id: string;
      observed: Date | string;
      score: number;
      valid_until: Date;
    }>(latestRiskContributions(segmentId, interventionAt));
    const contributions = readings.map((r) => ({
      readingId: r.id,
      source: r.source,
      score: r.score,
      observedAt: new Date(r.observed).toISOString(),
    }));
    const fused = fuse(readings);
    const score = fused?.score ?? null;
    const validUntil = readings.length
      ? new Date(Math.min(...readings.map((r) => new Date(r.valid_until).getTime()))).toISOString()
      : null;
    const [state] = await tx.execute<{ risk_version: number }>(sql`
      UPDATE road_segments SET score_current = ${score}, score_divergent = ${fused?.divergent ?? false},
        risk_version = risk_version + 1, risk_valid_until = ${validUntil}::timestamptz,
        risk_policy_version = ${RISK_POLICY_VERSION}, risk_contributions = ${JSON.stringify(contributions)}::jsonb, updated_at = clock_timestamp()
      WHERE id = ${segmentId} RETURNING risk_version
    `);
    if (score === null || !crossedRiskThreshold(segment.score_current ?? 0, score)) return;
    const level = riskLevel(score);
    if (!level) return;
    await appendEvent(tx, SEGMENT_EVENTS_QUEUE, SEGMENT_RISK_LEVEL_CHANGED_JOB, {
      segmentId,
      score,
      level,
      readingId,
      riskVersion: state.risk_version,
      interventionAt: interventionAt,
      contributions,
      policyVersion: RISK_POLICY_VERSION,
    });
  }
}
