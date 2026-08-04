import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth.service";
import { ApiKeyRequest } from "../api-key.entity";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const rawKey: unknown = request.headers["x-api-key"];

    if (typeof rawKey !== "string" || !rawKey) {
      throw new UnauthorizedException("Missing API key");
    }

    const apiKey = await this.authService.verifyApiKey(rawKey);
    if (!apiKey) throw new UnauthorizedException("Invalid API key");

    request.apiKeySource = apiKey.source;
    return true;
  }
}
