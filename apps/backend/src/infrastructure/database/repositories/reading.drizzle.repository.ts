import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { Reading, ReadingClassification, ReadingSource } from "@domain/entities/reading.entity";
import { IReadingRepository } from "@domain/repositories/reading.repository";
import { DrizzleService } from "../drizzle.service";
import { readings } from "../schema";

type ReadingRow = {
  id: string;
  segment_id: string;
  source: ReadingSource;
  height_cm: number | null;
  classification: ReadingClassification | null;
  confidence: number;
  score: number;
  lat: number;
  lon: number;
  metadata: Record<string, unknown> | null;
  created_at: Date;
};

@Injectable()
export class ReadingDrizzleRepository implements IReadingRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async save(reading: Reading): Promise<Reading> {
    const [saved] = await this.drizzle.db
      .insert(readings)
      .values({
        id: reading.id,
        segmentId: reading.segmentId,
        source: reading.source,
        heightCm: reading.heightCm,
        classification: reading.classification,
        confidence: reading.confidence,
        score: reading.score,
        lat: reading.lat,
        lon: reading.lon,
        metadata: reading.metadata,
        createdAt: reading.createdAt,
      })
      .returning();

    return new Reading(
      saved.id,
      saved.segmentId,
      saved.source as ReadingSource,
      saved.heightCm,
      saved.classification as ReadingClassification | null,
      saved.confidence,
      saved.score,
      saved.lat,
      saved.lon,
      (saved.metadata as Record<string, unknown> | null) ?? null,
      saved.createdAt,
    );
  }

  async findLatestBySourceBySegmentSince(segmentId: string, since: Date): Promise<Reading[]> {
    const rows = await this.drizzle.db.execute<ReadingRow>(sql`
      SELECT DISTINCT ON (source)
        id,
        segment_id,
        source,
        height_cm,
        classification,
        confidence,
        score,
        lat,
        lon,
        metadata,
        created_at
      FROM readings
      WHERE segment_id = ${segmentId}
        AND created_at >= ${since}
      ORDER BY source, created_at DESC
    `);

    return rows.map(
      (row) =>
        new Reading(
          row.id,
          row.segment_id,
          row.source,
          row.height_cm,
          row.classification,
          row.confidence,
          row.score,
          row.lat,
          row.lon,
          row.metadata,
          row.created_at,
        ),
    );
  }
}
