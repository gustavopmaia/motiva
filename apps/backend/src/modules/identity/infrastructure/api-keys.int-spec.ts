import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../../../database/drizzle.service";
import { createTestDrizzle, describeDb, migrateTestDb, truncateAll } from "../../../test-db";
import { AuthService } from "../../../auth/auth.service";
import { AuthorizationError } from "../../../common/errors";
import { ManageApiKeys } from "../application/api-keys";
import { DrizzleApiKeys } from "./drizzle-api-keys";
describeDb("API key administration", () => {
  let db: DrizzleService, auth: AuthService, commands: ManageApiKeys;
  const manager = { sub: randomUUID(), role: "manager" };
  beforeAll(async () => {
    db = createTestDrizzle();
    await migrateTestDb(db);
    auth = new AuthService(db, {} as never);
    commands = new ManageApiKeys(new DrizzleApiKeys(db));
  }, 60000);
  beforeEach(async () => {
    await truncateAll(db);
  });
  afterAll(async () => {
    await db.onModuleDestroy();
  });
  it("rotates a secret without changing its producer identity, then revokes it", async () => {
    const { apiKey, rawKey } = await auth.createApiKey("sensor", "iot");
    const rotated = await commands.rotate(apiKey.id, manager);
    expect(rotated.id).toBe(apiKey.id);
    expect(await auth.verifyApiKey(rawKey)).toBeNull();
    expect((await auth.verifyApiKey(rotated.key))?.id).toBe(apiKey.id);
    const listed = await commands.list(manager);
    expect(Object.keys(listed[0]).sort()).toEqual(["createdAt", "id", "name", "source"]);
    await Promise.all([commands.revoke(apiKey.id, manager), commands.revoke(apiKey.id, manager)]);
    expect(await auth.verifyApiKey(rotated.key)).toBeNull();
    expect(
      await db.db.execute(sql`SELECT id FROM api_key_audit WHERE action = 'revoked'`),
    ).toHaveLength(1);
  });
  it("rejects administration by field users inside the application case", async () => {
    await expect(
      commands.rotate(randomUUID(), { sub: randomUUID(), role: "field" }),
    ).rejects.toThrow(AuthorizationError);
  });
});
