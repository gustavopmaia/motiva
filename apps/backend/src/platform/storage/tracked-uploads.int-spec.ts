import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../../database/drizzle.service";
import { createTestDrizzle, describeDb, migrateTestDb, truncateAll } from "../../test-db";
import { TrackedUploads } from "./tracked-uploads";

describeDb("upload inventory and recovery", () => {
  let db: DrizzleService;
  let uploads: TrackedUploads;
  const storage = { put: jest.fn(), get: jest.fn(), delete: jest.fn() };
  const key = () => `${randomUUID()}.jpg`;
  beforeAll(async () => {
    db = createTestDrizzle();
    await migrateTestDb(db);
    uploads = new TrackedUploads(db, storage);
  }, 60000);
  beforeEach(async () => {
    await truncateAll(db);
    jest.resetAllMocks();
  });
  afterAll(async () => {
    await db.onModuleDestroy();
  });
  it("retains an inventory record when the process fails during upload", async () => {
    const objectKey = key();
    storage.put.mockRejectedValueOnce(new Error("Connection lost after PUT"));
    await expect(uploads.put("vehicle-captures", objectKey, Buffer.from("photo"))).rejects.toThrow(
      "Connection lost",
    );
    expect(
      await db.db.execute(sql`SELECT key FROM object_uploads WHERE state = 'pending'`),
    ).toHaveLength(1);
  });
  it("does not delete recent or attached uploads and only mutates with apply", async () => {
    const recent = key(),
      orphan = key(),
      attached = key();
    for (const objectKey of [recent, orphan, attached])
      await uploads.put("vehicle-captures", objectKey, Buffer.from("photo"));
    await db.transaction((tx) => uploads.attach(tx, "vehicle-captures", attached));
    await db.db.execute(
      sql`UPDATE object_uploads SET created_at = clock_timestamp() - interval '25 hours' WHERE key <> ${recent}`,
    );
    expect(await uploads.cleanup({ apply: false, graceHours: 24 })).toEqual([
      { namespace: "vehicle-captures", key: orphan },
    ]);
    expect(storage.delete).not.toHaveBeenCalled();
    await uploads.cleanup({ apply: true, graceHours: 24 });
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith("vehicle-captures", orphan);
    await expect(
      db.transaction((tx) => uploads.attach(tx, "vehicle-captures", orphan)),
    ).rejects.toThrow("no longer available");
  });
  it("recovers a crash during deletion without allowing a late attachment", async () => {
    const objectKey = key();
    await uploads.put("vehicle-captures", objectKey, Buffer.from("photo"));
    await db.db.execute(
      sql`UPDATE object_uploads SET created_at = clock_timestamp() - interval '25 hours'`,
    );
    storage.delete.mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(uploads.cleanup({ apply: true, graceHours: 24 })).rejects.toThrow(
      "Storage unavailable",
    );
    await expect(
      db.transaction((tx) => uploads.attach(tx, "vehicle-captures", objectKey)),
    ).rejects.toThrow("no longer available");
    await uploads.cleanup({ apply: true, graceHours: 24 });
    expect(
      await db.db.execute(sql`SELECT key FROM object_uploads WHERE state = 'deleted'`),
    ).toHaveLength(1);
  });
});
