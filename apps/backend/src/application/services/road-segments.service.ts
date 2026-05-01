import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { RoadSegment } from "@domain/entities/road-segment.entity";
import { DrizzleService } from "@infrastructure/database/drizzle.service";

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
export class RoadSegmentsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(): Promise<RoadSegment[]> {
    const rows = await this.drizzle.db.execute<RoadSegmentRow>(sql`
      SELECT id, road_name, km_start, km_end, mowing_type, score_current, score_divergent
      FROM road_segments
      ORDER BY road_name, km_start
    `);

    return rows.map((row) => ({
      id: row.id,
      roadName: row.road_name,
      kmStart: Number(row.km_start),
      kmEnd: Number(row.km_end),
      mowingType: row.mowing_type,
      scoreCurrent: row.score_current,
      scoreDivergent: row.score_divergent,
    }));
  }
}
