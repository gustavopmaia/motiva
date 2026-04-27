import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { verifyJwt } from "@application/security/jwt";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>("JWT_SECRET");
    if (!secret) throw new UnauthorizedException("JWT secret is not configured");

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) throw new UnauthorizedException("Missing token");

    const token = authHeader.slice(7);
    const payload = verifyJwt(token, secret);
    if (!payload) throw new UnauthorizedException("Invalid or expired token");

    request.user = payload;
    return true;
  }
}
