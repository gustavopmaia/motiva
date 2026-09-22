import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../database/drizzle.service";
import {
  createTestDrizzle,
  describeDb,
  insertSegment,
  insertAlert,
  insertWorkOrder,
  insertTeam,
  migrateTestDb,
  truncateAll,
} from "../test-db";
import { WorkOrdersService, SYSTEM_ACTOR } from "../work-orders/work-orders.service";
import { TrackedUploads } from "../platform/storage/tracked-uploads";
import { WorkOrderPhotosService } from "./work-order-photos.service";
import { AuthorizationError } from "../common/errors";

// Synthetic 1px JPEG, no EXIF; preserves the legacy acceptance of missing metadata.
import { jpeg } from "../test-photo";
describeDb("completion evidence transaction", () => {
  let db: DrizzleService, orders: WorkOrdersService, photos: WorkOrderPhotosService, id: string;
  const input = { lat: 0, lon: 0, capturedAt: new Date("2026-01-01T12:00:00Z") };
  const storage = { put: jest.fn(), get: jest.fn(), delete: jest.fn() };
  beforeAll(async () => {
    db = createTestDrizzle();
    await migrateTestDb(db);
  }, 60000);
  afterAll(async () => {
    await db.onModuleDestroy();
  });
  beforeEach(async () => {
    await truncateAll(db);
    jest.restoreAllMocks();
    jest.resetAllMocks();
    orders = new WorkOrdersService(db);
    photos = new WorkOrderPhotosService(
      db,
      new ConfigService({}),
      orders,
      new TrackedUploads(db, storage),
    );
    const segmentId = randomUUID(),
      alertId = randomUUID();
    id = randomUUID();
    await insertSegment(db, { id: segmentId, roadName: "BR-101", kmStart: 0, kmEnd: 1 });
    await insertAlert(db, { id: alertId, segmentId, level: "urgent" });
    await insertWorkOrder(db, { id, segmentId, alertId });
  });
  it("commits one photo and intervention when the same request races", async () => {
    const [a, b] = await Promise.all([
      photos.attachAndComplete(id, input, jpeg, SYSTEM_ACTOR),
      photos.attachAndComplete(id, input, jpeg, SYSTEM_ACTOR),
    ]);
    expect(a).toEqual(b);
    expect(a.photo.validationStatus).toBe("missing_exif");
    expect(await db.db.execute(sql`SELECT id FROM work_order_photos`)).toHaveLength(1);
    expect(
      await db.db.execute(
        sql`SELECT id FROM maintenance_audit WHERE action = 'work-order.completed'`,
      ),
    ).toHaveLength(1);
  });
  it("rolls back photo association together with completion on failure", async () => {
    jest.spyOn(orders, "complete").mockRejectedValueOnce(new Error("Failure after photo insert"));
    await expect(photos.attachAndComplete(id, input, jpeg, SYSTEM_ACTOR)).rejects.toThrow(
      "Failure after photo insert",
    );
    expect(await db.db.execute(sql`SELECT id FROM work_order_photos`)).toHaveLength(0);
    expect(
      await db.db.execute(sql`SELECT key FROM object_uploads WHERE state = 'pending'`),
    ).toHaveLength(1);
    expect((await orders.findById(id))?.status).toBe("open");
  });
  it("rechecks membership after external upload and before the commit", async () => {
    const teamId = randomUUID(),
      userId = randomUUID();
    await insertTeam(db, { id: teamId, name: "Field", roadName: "BR-101", kmStart: 0, kmEnd: 1 });
    await db.db.execute(
      sql`INSERT INTO users (id, email, name, password) VALUES (${userId}, 'field@test.local', 'Field', 'not-used')`,
    );
    await db.db.execute(
      sql`INSERT INTO team_members (id, team_id, user_id, role) VALUES (${randomUUID()}, ${teamId}, ${userId}, 'member')`,
    );
    await db.db.execute(sql`UPDATE work_orders SET team_id = ${teamId} WHERE id = ${id}`);
    storage.put.mockImplementationOnce(() =>
      db.db.execute(sql`DELETE FROM team_members WHERE user_id = ${userId}`),
    );
    await expect(
      photos.attachAndComplete(id, input, jpeg, {
        sub: userId,
        email: "field@test.local",
        role: "field",
      }),
    ).rejects.toThrow(AuthorizationError);
    expect(await db.db.execute(sql`SELECT id FROM work_order_photos`)).toHaveLength(0);
    expect((await orders.findById(id))?.status).toBe("open");
  });
});
