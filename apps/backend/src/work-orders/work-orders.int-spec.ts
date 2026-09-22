import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../database/drizzle.service";
import {
  createTestDrizzle,
  describeDb,
  insertSegment,
  insertAlert,
  insertWorkOrder,
  migrateTestDb,
  truncateAll,
} from "../test-db";
import { WorkOrdersService, SYSTEM_ACTOR } from "./work-orders.service";
import { AuthorizationError, InvalidOperationError } from "../common/errors";

describeDb("work order atomic commands", () => {
  let db: DrizzleService;
  let service: WorkOrdersService;
  let id: string;
  beforeAll(async () => {
    db = createTestDrizzle();
    await migrateTestDb(db);
    service = new WorkOrdersService(db);
  }, 60000);
  afterAll(async () => {
    await db.onModuleDestroy();
  });
  beforeEach(async () => {
    await truncateAll(db);
    const segmentId = randomUUID(),
      alertId = randomUUID();
    id = randomUUID();
    await insertSegment(db, { id: segmentId, roadName: "BR-101", kmStart: 0, kmEnd: 1 });
    await insertAlert(db, { id: alertId, segmentId, level: "urgent" });
    await insertWorkOrder(db, { id, segmentId, alertId });
  });
  it("returns the same completion when commands race", async () => {
    const [a, b] = await Promise.all([
      service.complete(id, SYSTEM_ACTOR),
      service.complete(id, SYSTEM_ACTOR),
    ]);
    expect(a.status).toBe("completed");
    expect(b.completedAt).toEqual(a.completedAt);
  });
  it("does not authorize a field user outside their assigned team", async () => {
    await expect(
      service.update(
        id,
        { status: "in_progress" },
        { sub: randomUUID(), email: "field@test.local", role: "field" },
      ),
    ).rejects.toThrow(AuthorizationError);
    expect((await service.findById(id))?.status).toBe("open");
  });
  it("does not reopen a completed order", async () => {
    await service.complete(id, SYSTEM_ACTOR);
    await expect(service.update(id, { status: "open" }, SYSTEM_ACTOR)).rejects.toThrow(
      InvalidOperationError,
    );
  });
  it("rolls back the entire completion when an enclosing transaction fails", async () => {
    await expect(
      db.db.transaction(async (tx) => {
        await service.complete(id, SYSTEM_ACTOR, tx);
        throw new Error("Crash before commit");
      }),
    ).rejects.toThrow("Crash before commit");
    expect((await service.findById(id))?.status).toBe("open");
    const [row] = await db.db.execute<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM road_segments WHERE last_intervention_at IS NOT NULL`,
    );
    expect(row.total).toBe(0);
  });
});
