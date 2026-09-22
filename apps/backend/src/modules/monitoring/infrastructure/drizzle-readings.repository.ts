import { createHash, randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { Reading, ReadingClassification } from "../domain/reading";
import { DuplicateResourceError } from "../../../common/errors";
import { DrizzleService } from "../../../database/drizzle.service";
import { readings } from "./schema";
import { Transaction } from "../../../platform/persistence/transaction";
import { DrizzleRiskFusion } from "./drizzle-risk-fusion";
import { NormalizedReading, ReadingWriter } from "../application/ingest-reading";
export class DrizzleReadingsRepository implements ReadingWriter {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly fusion: DrizzleRiskFusion,
    private readonly transaction?: Transaction,
  ) {}
  async accept(input: NormalizedReading): Promise<Reading> {
    if (!this.transaction)
      return this.drizzle.transaction((tx) =>
        new DrizzleReadingsRepository(this.drizzle, this.fusion, tx).accept(input),
      );
    const tx = this.transaction;
    const { segmentId, confidence, score } = input;
    await tx.execute(sql`SELECT id FROM road_segments WHERE id = ${segmentId} FOR UPDATE`);
    const fingerprint = createHash("sha256")
      .update(
        canonicalJson({
          source: input.source,
          lat: input.lat,
          lon: input.lon,
          score,
          confidence,
          heightCm: input.source === "iot" ? input.heightCm : null,
          classification: input.source === "vehicle" ? input.classification : null,
          ndvi: input.source === "satellite" ? input.ndvi : null,
          observedAt: input.observedAt?.toISOString() ?? null,
          metadata: input.metadata ?? null,
        }),
      )
      .digest("hex");
    const [saved] = await tx
      .insert(readings)
      .values({
        id: randomUUID(),
        segmentId,
        source: input.source,
        heightCm: input.source === "iot" ? input.heightCm : null,
        classification: input.source === "vehicle" ? input.classification : null,
        confidence,
        score,
        lat: input.lat,
        lon: input.lon,
        metadata: input.metadata ?? null,
        createdAt: new Date(),
        observedAt: input.observedAt ?? new Date(),
        originKey: input.originKey ?? null,
        captureId: input.captureId ?? null,
        inputHash: fingerprint,
      })
      .onConflictDoNothing()
      .returning();
    if (!saved) {
      const condition = input.captureId
        ? eq(readings.captureId, input.captureId)
        : sql`${readings.source} = ${input.source} AND ${readings.originKey} = ${input.originKey ?? null}`;
      const [existing] = await tx.select().from(readings).where(condition).limit(1);
      if (!existing || existing.inputHash !== fingerprint)
        throw new DuplicateResourceError("Reading identity already used with different content");
      return toReading(existing);
    }
    await this.fusion.updateScoreForSegment(segmentId, saved.id, tx);
    return toReading(saved);
  }
}

function toReading(row: typeof readings.$inferSelect): Reading {
  return {
    id: row.id,
    segmentId: row.segmentId,
    source: row.source as Reading["source"],
    heightCm: row.heightCm,
    classification: row.classification as ReadingClassification | null,
    confidence: row.confidence,
    score: row.score,
    lat: row.lat,
    lon: row.lon,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
  };
}

function canonicalJson(input: unknown): string {
  return JSON.stringify(input, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}
