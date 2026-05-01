import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ApiKey, ApiKeySource } from "@domain/entities/api-key.entity";
import { ApiKeyRepository } from "@domain/repositories/api-key.repository";
import { DrizzleService } from "../drizzle.service";
import { apiKeys } from "../schema";

@Injectable()
export class ApiKeyDrizzleRepository implements ApiKeyRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async save(apiKey: ApiKey): Promise<ApiKey> {
    const [saved] = await this.drizzle.db
      .insert(apiKeys)
      .values({
        id: apiKey.id,
        name: apiKey.name,
        source: apiKey.source,
        key: apiKey.key,
        createdAt: apiKey.createdAt,
      })
      .returning();
    return this.toEntity(saved);
  }

  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.key, keyHash))
      .limit(1);
    if (!row) return null;
    return this.toEntity(row);
  }

  private toEntity(row: typeof apiKeys.$inferSelect): ApiKey {
    return new ApiKey(row.id, row.name, row.source as ApiKeySource, row.key, row.createdAt);
  }
}
