import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import {
  IRoadSegmentRepository,
  MowingFeatureMatchInput,
  RoadSegmentUpsertInput,
} from "@domain/repositories/road-segment.repository";
import { GeoJsonValidationError } from "@domain/geojson-validation.error";
import { DrizzleService } from "../drizzle.service";

type MowingOverlapRow = { idx: number; mowing_type: string; overlap_len: number | string };
type UpsertRow = { created: boolean };

const MOWING_MATCH_BATCH_SIZE = 200;
const UPSERT_BATCH_SIZE = 500;

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

    const bestByIndex = new Map<number, { mowingType: string; overlapLen: number }>();

    for (const mowingChunk of this.chunk(mowingFeatures, MOWING_MATCH_BATCH_SIZE)) {
      const mowingValues = sql.join(
        mowingChunk.map(
          (f) =>
            sql`(${f.roadName}::text, ${f.mowingType}::text, ST_GeomFromText(${f.geometryWkt}, 4326))`,
        ),
        sql`, `,
      );

      const rows = await this.executeOrThrowValidation<MowingOverlapRow>(sql`
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
        )
        select distinct on (idx)
          idx,
          mowing_type,
          overlap_len
        from overlaps
        where overlap_len > 0
        order by idx, overlap_len desc, mowing_type asc
      `);

      for (const row of rows) {
        const index = Number(row.idx);
        const overlapLen = Number(row.overlap_len);

        if (!Number.isFinite(index) || !Number.isFinite(overlapLen) || !row.mowing_type) {
          continue;
        }

        const current = bestByIndex.get(index);

        if (
          !current ||
          overlapLen > current.overlapLen ||
          (overlapLen === current.overlapLen && row.mowing_type < current.mowingType)
        ) {
          bestByIndex.set(index, { mowingType: row.mowing_type, overlapLen });
        }
      }
    }

    return segments.map((_, idx) => bestByIndex.get(idx)?.mowingType ?? null);
  }

  async upsertAll(
    segments: RoadSegmentUpsertInput[],
  ): Promise<{ created: number; updated: number }> {
    if (segments.length === 0) {
      return { created: 0, updated: 0 };
    }

    let created = 0;
    let updated = 0;

    for (const chunk of this.chunk(segments, UPSERT_BATCH_SIZE)) {
      const values = sql.join(
        chunk.map(
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

      const createdInBatch = rows.filter((row) => row.created).length;
      created += createdInBatch;
      updated += rows.length - createdInBatch;
    }

    return { created, updated };
  }

  private async executeOrThrowValidation<T extends Record<string, unknown>>(
    statement: ReturnType<typeof sql>,
  ) {
    try {
      return await this.drizzle.db.execute<T>(statement);
    } catch (error) {
      const messages = this.collectErrorMessages(error);

      if (messages.some((message) => this.isInvalidGeometryError(message))) {
        throw new GeoJsonValidationError(
          "The uploaded GeoJSON contains invalid geospatial geometry.",
        );
      }

      throw error;
    }
  }

  private collectErrorMessages(error: unknown): string[] {
    const messages: string[] = [];
    const visited = new Set<unknown>();
    let current: unknown = error;

    while (current instanceof Error && !visited.has(current)) {
      visited.add(current);

      if (current.message.trim().length > 0) {
        messages.push(current.message);
      }

      current = (current as Error & { cause?: unknown }).cause;
    }

    return messages;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }

    return chunks;
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
