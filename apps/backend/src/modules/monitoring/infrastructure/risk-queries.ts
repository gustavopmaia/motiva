import { sql } from "drizzle-orm";

export function latestRiskContributions(segmentId: string, interventionAt: string | null) {
  // Three bounded index seeks; DISTINCT ON would visit every recent reading
  // of a hot segment merely to keep the newest row of each source.
  return sql`
    SELECT sources.source, latest.id, latest.observed, latest.score, latest.observed + interval '24 hours' AS valid_until
    FROM (VALUES ('iot'), ('vehicle'), ('satellite')) AS sources(source)
    CROSS JOIN LATERAL (
      SELECT r.id, r.score, COALESCE(r.observed_at, r.created_at AT TIME ZONE 'UTC') AS observed
      FROM readings r WHERE r.segment_id = ${segmentId} AND r.source = sources.source
        AND COALESCE(r.observed_at, r.created_at AT TIME ZONE 'UTC') <= statement_timestamp() + interval '5 minutes'
        AND COALESCE(r.observed_at, r.created_at AT TIME ZONE 'UTC') >= statement_timestamp() - interval '24 hours'
        AND (${interventionAt}::timestamptz IS NULL OR COALESCE(r.observed_at, r.created_at AT TIME ZONE 'UTC') > ${interventionAt}::timestamptz)
      ORDER BY COALESCE(r.observed_at, r.created_at AT TIME ZONE 'UTC') DESC, r.id DESC LIMIT 1
    ) latest
  `;
}
