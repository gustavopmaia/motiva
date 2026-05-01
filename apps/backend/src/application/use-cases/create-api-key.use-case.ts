import { Injectable, Inject } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "crypto";
import { ApiKey, ApiKeySource } from "@domain/entities/api-key.entity";
import { ApiKeyRepository } from "@domain/repositories/api-key.repository";

@Injectable()
export class CreateApiKeyUseCase {
  constructor(
    @Inject(ApiKeyRepository)
    private readonly apiKeyRepository: ApiKeyRepository,
  ) {}

  async execute(name: string, source: ApiKeySource): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const rawKey = randomBytes(32).toString("hex");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const apiKey = new ApiKey(randomUUID(), name, source, keyHash);
    const saved = await this.apiKeyRepository.save(apiKey);
    return { apiKey: saved, rawKey };
  }
}
