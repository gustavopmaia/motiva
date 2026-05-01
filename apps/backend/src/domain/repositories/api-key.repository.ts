import { ApiKey } from "@domain/entities/api-key.entity";

export const ApiKeyRepository = Symbol("ApiKeyRepository");

export interface ApiKeyRepository {
  save(apiKey: ApiKey): Promise<ApiKey>;
  findByKeyHash(keyHash: string): Promise<ApiKey | null>;
}
