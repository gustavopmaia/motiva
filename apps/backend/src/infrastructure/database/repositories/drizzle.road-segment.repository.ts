import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { IRoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { RoadSegment } from "@domain/entities/road-segment.entity";
import { DrizzleService } from "../drizzle.service";

type RoadSegmentRow = {
  id: string;
  road_name: string;
  km_start: string;
  km_end: string;
  mowing_type: string | null;
};

@Injectable()
export class DrizzleRoadSegmentRepository implements IRoadSegmentRepository {
  constructor(private drizzle: DrizzleService) {}

  async findByLocation(lat: number, lon: number): Promise<RoadSegment | null> {
    const rows = await this.drizzle.db.execute<RoadSegmentRow>(sql`
      SELECT id, road_name, km_start, km_end, mowing_type
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
    );
  }
}
