import { sql } from "drizzle-orm";
import { DrizzleService } from "../../../database/drizzle.service";
import { NotFoundError } from "../../../common/errors";

export class DrizzleSegmentLocator {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly radius = 500,
  ) {}
  async locate(lat: number, lon: number): Promise<string> {
    const radius = this.radius;
    const [segment] = await this.drizzle.db.execute<{ id: string }>(
      nearbySegmentQuery(lat, lon, radius),
    );
    if (!segment) throw new NotFoundError("Road segment not found within acceptance radius");
    return segment.id;
  }
}

export function nearbySegmentQuery(lat: number, lon: number, radius: number) {
  return sql`
      SELECT id FROM road_segments
      WHERE ST_DWithin(geometry::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${radius})
      ORDER BY ST_Distance(geometry::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography), id
      LIMIT 1
    `;
}
