import { ApiKey, ApiKeySource } from "@domain/entities/api-key.entity";

export abstract class ApiKeyRepository {
  abstract save(apiKey: ApiKey): Promise<ApiKey>;
  abstract findByKeyHash(keyHash: string): Promise<ApiKey | null>;
  abstract findBySource(source: ApiKeySource): Promise<ApiKey | null>;
}
