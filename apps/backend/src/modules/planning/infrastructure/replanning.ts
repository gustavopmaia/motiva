import { sql } from "drizzle-orm";
import { Transaction } from "../../../platform/persistence/transaction";

/** The caller's transaction makes business changes and replanning intent indivisible. */
export async function requestReplanning(tx: Transaction, teamIds?: string[]): Promise<void> {
  if (teamIds?.length === 0) return;
  await tx.execute(sql`INSERT INTO dispatch_requests (team_id) SELECT id FROM teams WHERE active = true ${
    teamIds
      ? sql`AND id IN (${sql.join(
          teamIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``
  } ORDER BY id
    ON CONFLICT (team_id) DO UPDATE SET requested_version = dispatch_requests.requested_version + 1, requested_at = clock_timestamp()`);
}

/** Replan only territories and current assignments affected by this segment. */
export async function requestSegmentReplanning(tx: Transaction, segmentId: string): Promise<void> {
  const teamIds = await tx.execute<{ id: string }>(sql`
    SELECT t.id FROM teams t WHERE t.active = true AND (
      EXISTS (SELECT 1 FROM road_segments rs WHERE rs.id = ${segmentId} AND rs.road_name = t.road_name AND rs.km_start <= t.km_end AND rs.km_end >= t.km_start)
      OR EXISTS (SELECT 1 FROM work_orders wo WHERE wo.segment_id = ${segmentId} AND wo.team_id = t.id)
    ) ORDER BY t.id
  `);
  await requestReplanning(
    tx,
    teamIds.map((team) => team.id),
  );
}
