import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { RoadSegment, SegmentGeometry } from "./road-segment.entity";
import { Territory, territoryOverlap } from "../common/territory";
import { DrizzleService } from "../database/drizzle.service";

type RoadSegmentRow = {
  id: string;
  roadName: string;
  kmStart: string;
  kmEnd: string;
  mowingType: string | null;
  scoreCurrent: number | null;
  scoreDivergent: boolean;
  geometry: SegmentGeometry;
};

@Injectable()
export class RoadSegmentsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(territory?: Territory): Promise<RoadSegment[]> {
    const where = territory ? sql`WHERE ${territoryOverlap(territory)}` : sql``;

    const rows = await this.drizzle.db.execute<RoadSegmentRow>(sql`
      SELECT id, road_name AS "roadName", km_start AS "kmStart", km_end AS "kmEnd",
             mowing_type AS "mowingType", score_current AS "scoreCurrent",
             score_divergent AS "scoreDivergent",
             ST_AsGeoJSON(geometry)::json AS geometry
      FROM road_segments
      ${where}
      ORDER BY road_name, km_start
    `);

    return rows.map(toSegment);
  }
}

function toSegment(row: RoadSegmentRow): RoadSegment {
  return {
    id: row.id,
    roadName: row.roadName,
    kmStart: Number(row.kmStart),
    kmEnd: Number(row.kmEnd),
    mowingType: row.mowingType,
    scoreCurrent: row.scoreCurrent,
    scoreDivergent: row.scoreDivergent,
    geometry: row.geometry,
  };
}
