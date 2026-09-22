const { writeFileSync, mkdirSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const { randomUUID } = require("node:crypto");
const { sql } = require("drizzle-orm");
const { DrizzleService } = require("../dist/src/database/drizzle.service");
const {
  latestRiskContributions,
} = require("../dist/src/modules/monitoring/infrastructure/risk-queries");
const {
  nearbySegmentQuery,
} = require("../dist/src/modules/road-network/infrastructure/drizzle-segment-locator");
async function main() {
  if (!process.env.TEST_DATABASE_URL || process.env.BENCH_CONFIRM_DISPOSABLE !== "1")
    throw new Error("Requires disposable TEST_DATABASE_URL and BENCH_CONFIRM_DISPOSABLE=1");
  const db = new DrizzleService({ getOrThrow: () => process.env.TEST_DATABASE_URL });
  const rollback = new Error("Rollback benchmark fixtures");
  const result = {
    at: new Date().toISOString(),
    fixture: { segments: 10000, readingsInOneSegment: 10000 },
    plans: {},
  };
  try {
    await db.db.transaction(async (tx) => {
      const segment = randomUUID(),
        road = `EXPLAIN-${randomUUID()}`;
      await tx.execute(sql`INSERT INTO road_segments (id, road_name, km_start, km_end, geometry)
        SELECT CASE WHEN n = 0 THEN ${segment}::uuid ELSE gen_random_uuid() END, ${road}, n, n + 1,
          ST_SetSRID(ST_MakeLine(ST_MakePoint((n % 100) * .03, (n / 100) * .03), ST_MakePoint((n % 100) * .03 + .01, (n / 100) * .03 + .01)), 4326)
        FROM generate_series(0, 9999) n`);
      await tx.execute(sql`INSERT INTO readings (id, segment_id, source, score, confidence, lat, lon, observed_at)
        SELECT gen_random_uuid(), ${segment}, (ARRAY['iot','vehicle','satellite'])[1 + (n % 3)], 50, 1, 0, 0,
          statement_timestamp() - n * interval '1 second' FROM generate_series(1, 10000) n`);
      await tx.execute(sql`ANALYZE road_segments`);
      await tx.execute(sql`ANALYZE readings`);
      for (const [name, query] of Object.entries({
        geography: nearbySegmentQuery(0, 0, 500),
        latestReadings: latestRiskContributions(segment, null),
      })) {
        const [row] = await tx.execute(sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
        result.plans[name] = row["QUERY PLAN"];
      }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await db.onModuleDestroy();
  }
  const output = resolve(__dirname, "../../../docs/benchmarks/query-plans.json");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(output);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
