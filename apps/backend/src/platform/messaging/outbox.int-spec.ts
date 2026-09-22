import { DrizzleMaintenanceRiskRepository } from "../../modules/maintenance/infrastructure/drizzle-maintenance-risk.repository";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { DrizzleService } from "../../database/drizzle.service";
import {
  createTestDrizzle,
  describeDb,
  insertSegment,
  migrateTestDb,
  truncateAll,
} from "../../test-db";
import { appendEvent, consumeEvent } from "./outbox";
import { RiskChangedHandler } from "../../modules/maintenance/public";

describeDb("durable event processing", () => {
  let db: DrizzleService;
  beforeAll(async () => {
    db = createTestDrizzle();
    await migrateTestDb(db);
  }, 60000);
  afterAll(async () => {
    await db.onModuleDestroy();
  });
  beforeEach(async () => {
    await truncateAll(db);
  });
  it("rolls back an event with its business transaction", async () => {
    await expect(
      db.db.transaction(async (tx) => {
        await appendEvent(tx, "segment-events", "test", {});
        throw new Error("Crash");
      }),
    ).rejects.toThrow("Crash");
    const rows = await db.db.execute(sql`SELECT id FROM outbox_events`);
    expect(rows).toHaveLength(0);
  });
  it("commits one effect when multiple consumers receive the same event", async () => {
    const id = await db.db.transaction((tx) => appendEvent(tx, "segment-events", "test", {}));
    let effects = 0;
    await Promise.all(
      Array.from({ length: 5 }, () =>
        db.db.transaction((tx) =>
          consumeEvent(tx, id, async () => {
            effects++;
          }),
        ),
      ),
    );
    expect(effects).toBe(1);
  });
  it("atomically creates a linked alert and OS, and ignores replay", async () => {
    const segmentId = randomUUID();
    await insertSegment(db, { id: segmentId, roadName: "BR-101", kmStart: 0, kmEnd: 1 });
    await db.db.execute(sql`UPDATE road_segments SET score_current = 90 WHERE id = ${segmentId}`);
    const input = {
      segmentId,
      score: 90,
      level: "critical" as const,
      readingId: randomUUID(),
      interventionAt: null,
    };
    const eventId = await db.db.transaction((tx) =>
      appendEvent(tx, "segment-events", "segment.risk-level-changed", input),
    );
    const handler = new RiskChangedHandler(new DrizzleMaintenanceRiskRepository(db));
    await Promise.all([
      handler.execute({ ...input, eventId }),
      handler.execute({ ...input, eventId }),
    ]);
    const orders = await db.db.execute(
      sql`SELECT wo.id FROM work_orders wo JOIN alerts a ON a.id = wo.alert_id AND a.os_id = wo.id::text`,
    );
    expect(orders).toHaveLength(1);
  });
  it("does not recreate maintenance from an event predating intervention", async () => {
    const segmentId = randomUUID();
    await insertSegment(db, { id: segmentId, roadName: "BR-101", kmStart: 0, kmEnd: 1 });
    await db.db.execute(
      sql`UPDATE road_segments SET score_current = 90, last_intervention_at = clock_timestamp() WHERE id = ${segmentId}`,
    );
    await new RiskChangedHandler(new DrizzleMaintenanceRiskRepository(db)).execute({
      segmentId,
      score: 90,
      level: "critical",
      readingId: randomUUID(),
      interventionAt: null,
    });
    expect(await db.db.execute(sql`SELECT id FROM work_orders`)).toHaveLength(0);
  });
});
