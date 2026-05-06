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

export type SegmentTerritory = {
  roadName: string;
  kmStart: number;
  kmEnd: number;
};

@Injectable()
export class RoadSegmentsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(territory?: SegmentTerritory): Promise<RoadSegment[]> {
    const rows = territory
      ? await this.drizzle.db.execute<RoadSegmentRow>(sql`
          SELECT id, road_name, km_start, km_end, mowing_type, score_current, score_divergent
          FROM road_segments
          WHERE road_name = ${territory.roadName}
            AND CAST(km_start AS FLOAT) <= ${territory.kmEnd}
            AND CAST(km_end AS FLOAT) >= ${territory.kmStart}
          ORDER BY road_name, km_start
        `)
      : await this.drizzle.db.execute<RoadSegmentRow>(sql`
          SELECT id, road_name, km_start, km_end, mowing_type, score_current, score_divergent
          FROM road_segments
          ORDER BY road_name, km_start
        `);

    return rows.map(toSegment);
  }
}

function toSegment(row: RoadSegmentRow): RoadSegment {
  return {
    id: row.id,
    roadName: row.road_name,
    kmStart: Number(row.km_start),
    kmEnd: Number(row.km_end),
    mowingType: row.mowing_type,
    scoreCurrent: row.score_current,
    scoreDivergent: row.score_divergent,
  };
}
