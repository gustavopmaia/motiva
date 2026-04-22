import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedApiKey =
      this.config.get<string>("INGESTION_API_KEY") ?? this.config.get<string>("API_KEY");

    if (!expectedApiKey) throw new UnauthorizedException("API key is not configured");

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers["x-api-key"];

    if (typeof apiKey !== "string" || apiKey !== expectedApiKey) {
      throw new UnauthorizedException("Invalid API key");
    }

    return true;
  }
}
