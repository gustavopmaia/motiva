import { randomBytes, randomUUID, createHash } from "crypto";
import { desc, eq, sql } from "drizzle-orm";
import { DrizzleService } from "../../../database/drizzle.service";
import { NotFoundError } from "../../../common/errors";
import { apiKeys } from "./schema";
import { ApiKeyAdministration, KeySummary } from "../application/api-keys";
export class DrizzleApiKeys implements ApiKeyAdministration {
  constructor(private readonly drizzle: DrizzleService) {}
  list(): Promise<KeySummary[]> {
    return this.drizzle.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        source: apiKeys.source,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt))
      .limit(100);
  }
  rotate(id: string, actorId: string): Promise<KeySummary & { key: string }> {
    return this.drizzle.transaction(async (tx) => {
      const [existing] = await tx.select().from(apiKeys).where(eq(apiKeys.id, id)).for("update");
      if (!existing) throw new NotFoundError("API key not found");
      const key = randomBytes(32).toString("hex");
      await tx
        .update(apiKeys)
        .set({ key: createHash("sha256").update(key).digest("hex") })
        .where(eq(apiKeys.id, id));
      await tx.execute(
        sql`INSERT INTO api_key_audit (id, key_id, actor_id, action) VALUES (${randomUUID()}, ${id}, ${actorId}, 'rotated')`,
      );
      return {
        id,
        name: existing.name,
        source: existing.source,
        createdAt: existing.createdAt,
        key,
      };
    });
  }
  async revoke(id: string, actorId: string): Promise<void> {
    await this.drizzle.transaction(async (tx) => {
      const removed = await tx
        .delete(apiKeys)
        .where(eq(apiKeys.id, id))
        .returning({ id: apiKeys.id });
      if (removed.length)
        await tx.execute(
          sql`INSERT INTO api_key_audit (id, key_id, actor_id, action) VALUES (${randomUUID()}, ${id}, ${actorId}, 'revoked')`,
        );
    });
  }
}
