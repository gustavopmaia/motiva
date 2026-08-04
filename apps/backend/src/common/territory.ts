import { sql, SQL } from "drizzle-orm";

export type Territory = {
  roadName: string;
  kmStart: number;
  kmEnd: number;
};

export function territoryOverlap(territory: Territory, table = "road_segments"): SQL {
  const alias = sql.raw(table);
  return sql`${alias}.road_name = ${territory.roadName}
    AND CAST(${alias}.km_start AS FLOAT) <= ${territory.kmEnd}
    AND CAST(${alias}.km_end AS FLOAT) >= ${territory.kmStart}`;
}
