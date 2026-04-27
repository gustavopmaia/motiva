import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { RoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { RoadSegment } from "@domain/entities/road-segment.entity";
import { DrizzleService } from "../drizzle.service";
import { roadSegments } from "../schema";

type RoadSegmentRow = {
  id: string;
  road_name: string;
  km_start: string;
  km_end: string;
  mowing_type: string | null;
  score_current: number | null;
  score_divergent: boolean;
};

@Injectable()
export class RoadSegmentDrizzleRepository implements RoadSegmentRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async findByLocation(lat: number, lon: number): Promise<RoadSegment | null> {
    const rows = await this.drizzle.db.execute<RoadSegmentRow>(sql`
      SELECT id, road_name, km_start, km_end, mowing_type, score_current, score_divergent
      FROM road_segments
      ORDER BY ST_Distance(
        geometry::geography,
        ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography
      )
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) return null;

    return new RoadSegment(
      row.id,
      row.road_name,
      Number(row.km_start),
      Number(row.km_end),
      row.mowing_type,
      row.score_current,
      row.score_divergent,
    );
  }

  async findById(id: string): Promise<RoadSegment | null> {
    const [segment] = await this.drizzle.db
      .select()
      .from(roadSegments)
      .where(eq(roadSegments.id, id))
      .limit(1);

    if (!segment) return null;

    return new RoadSegment(
      segment.id,
      segment.roadName,
      Number(segment.kmStart),
      Number(segment.kmEnd),
      segment.mowingType,
      segment.scoreCurrent,
      segment.scoreDivergent,
    );
  }

  async updateScore(id: string, scoreCurrent: number, scoreDivergent: boolean): Promise<void> {
    await this.drizzle.db
      .update(roadSegments)
      .set({
        scoreCurrent,
        scoreDivergent,
      })
      .where(eq(roadSegments.id, id));
  }
}
