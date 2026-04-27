import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash } from "crypto";
import { ApiKeyRepository } from "@domain/repositories/api-key.repository";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawKey: unknown = request.headers["x-api-key"];

    if (typeof rawKey !== "string" || !rawKey) {
      throw new UnauthorizedException("Missing API key");
    }

    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const apiKey = await this.apiKeyRepository.findByKeyHash(keyHash);
    if (!apiKey) throw new UnauthorizedException("Invalid API key");

    request.apiKeySource = apiKey.source;
    return true;
  }
}
