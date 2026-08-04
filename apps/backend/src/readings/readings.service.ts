import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { Reading, ReadingClassification } from "./reading.entity";
import { NotFoundError } from "../common/errors";
import { CreateReadingInput } from "./readings.types";
import { DrizzleService } from "../database/drizzle.service";
import { readings } from "../database/schema";
import { FusionService } from "./fusion.service";

const VEHICLE_SCORE: Record<ReadingClassification, number> = {
  ok: 10,
  attention: 50,
  urgent: 85,
};

type SegmentMatchRow = {
  id: string;
};

@Injectable()
export class ReadingsService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly fusionService: FusionService,
  ) {}

  async create(input: CreateReadingInput): Promise<Reading> {
    const [segment] = await this.drizzle.db.execute<SegmentMatchRow>(sql`
      SELECT id
      FROM road_segments
      ORDER BY ST_Distance(
        geometry::geography,
        ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography
      )
      LIMIT 1
    `);

    if (!segment) throw new NotFoundError("Road segment not found");

    const confidence = normalizeConfidence(input.confidence);
    const score = Number(calculateScore(input, confidence).toFixed(2));

    const [saved] = await this.drizzle.db
      .insert(readings)
      .values({
        id: randomUUID(),
        segmentId: segment.id,
        source: input.source,
        heightCm: input.source === "iot" ? input.heightCm : null,
        classification: input.source === "vehicle" ? input.classification : null,
        confidence,
        score,
        lat: input.lat,
        lon: input.lon,
        metadata: input.metadata ?? null,
        createdAt: new Date(),
      })
      .returning();

    const reading = toReading(saved);
    await this.fusionService.updateScoreForSegment(segment.id, reading.id);
    return reading;
  }
}

function normalizeConfidence(confidence: number | undefined): number {
  if (confidence == null) return 1;
  return clamp(confidence > 1 ? confidence / 100 : confidence, 0, 1);
}

function calculateScore(input: CreateReadingInput, confidence: number): number {
  if (input.source === "iot") {
    return clamp(input.heightCm * 1.4, 0, 100);
  }

  if (input.source === "vehicle") {
    return clamp(VEHICLE_SCORE[input.classification] * confidence, 0, 100);
  }

  return clamp((input.ndvi - 0.2) * 200, 0, 100);
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
