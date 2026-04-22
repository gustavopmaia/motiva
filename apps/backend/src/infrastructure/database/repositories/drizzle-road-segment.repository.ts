import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import {
  IRoadSegmentRepository,
  MowingFeatureMatchInput,
  RoadSegmentUpsertInput,
} from "@domain/repositories/road-segment.repository";
import { KmzValidationError } from "@domain/kmz-validation.error";
import { DrizzleService } from "../drizzle.service";

type MowingTypeRow = { idx: number; mowing_type: string | null };
type UpsertRow = { created: boolean };

@Injectable()
export class DrizzleRoadSegmentRepository implements IRoadSegmentRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async findMowingTypes(
    segments: RoadSegmentUpsertInput[],
    mowingFeatures: MowingFeatureMatchInput[],
  ): Promise<(string | null)[]> {
    if (segments.length === 0 || mowingFeatures.length === 0) {
      return segments.map(() => null);
    }

    const segmentValues = sql.join(
      segments.map(
        (seg, idx) =>
          sql`(${idx}::int, ST_GeomFromText(${seg.geometryWkt}, 4326), ${seg.roadName}::text)`,
      ),
      sql`, `,
    );

    const mowingValues = sql.join(
      mowingFeatures.map(
        (f) =>
          sql`(${f.roadName}::text, ${f.mowingType}::text, ST_GeomFromText(${f.geometryWkt}, 4326))`,
      ),
      sql`, `,
    );

    const rows = await this.executeOrThrowValidation<MowingTypeRow>(sql`
      with segment_inputs(idx, geom, road_name) as (
        values ${segmentValues}
      ),
      mowing_data(road_name, mowing_type, geom) as (
        values ${mowingValues}
      ),
      overlaps as (
        select
          s.idx,
          md.mowing_type,
          coalesce(
            ST_Length(
              ST_Transform(
                ST_CollectionExtract(ST_Intersection(s.geom, md.geom), 2),
                3857
              )
            ),
            0
          ) as overlap_len
        from segment_inputs s, mowing_data md
        where ST_Intersects(s.geom, md.geom)
          and (
            md.road_name is null
            or lower(trim(md.road_name)) = lower(trim(s.road_name))
          )
      ),
      best as (
        select distinct on (idx) idx, mowing_type
        from overlaps
        where overlap_len > 0
        order by idx, overlap_len desc, mowing_type asc
      )
      select s.idx, b.mowing_type
      from segment_inputs s
      left join best b on s.idx = b.idx
      order by s.idx
    `);

    const byIndex = new Map(rows.map((row) => [Number(row.idx), row.mowing_type]));

    return segments.map((_, idx) => byIndex.get(idx) ?? null);
  }

  async upsertAll(
    segments: RoadSegmentUpsertInput[],
  ): Promise<{ created: number; updated: number }> {
    if (segments.length === 0) {
      return { created: 0, updated: 0 };
    }

    const values = sql.join(
      segments.map(
        (seg) =>
          sql`(
          ${seg.roadName},
          ${seg.kmStart},
          ${seg.kmEnd},
          ${seg.mowingType},
          ST_GeomFromText(${seg.geometryWkt}, 4326)
        )`,
      ),
      sql`, `,
    );

    const rows = await this.executeOrThrowValidation<UpsertRow>(sql`
      insert into road_segments (road_name, km_start, km_end, mowing_type, geometry)
      values ${values}
      on conflict (road_name, km_start, km_end) do update set
        mowing_type = excluded.mowing_type,
        geometry = excluded.geometry,
        updated_at = now()
      returning (xmax = 0) as created
    `);

    const created = rows.filter((r) => r.created).length;
    return { created, updated: rows.length - created };
  }

  private async executeOrThrowValidation<T extends Record<string, unknown>>(
    statement: ReturnType<typeof sql>,
  ) {
    try {
      return await this.drizzle.db.execute<T>(statement);
    } catch (error) {
      if (error instanceof Error && this.isInvalidGeometryError(error.message)) {
        throw new KmzValidationError("The KMZ contains invalid geospatial geometry.");
      }

      throw error;
    }
  }

  private isInvalidGeometryError(message: string) {
    const normalized = message.toLowerCase();

    return (
      normalized.includes("topologyexception") ||
      normalized.includes("parse error") ||
      normalized.includes("invalid geometry") ||
      normalized.includes("lwgeom")
    );
  }
}
