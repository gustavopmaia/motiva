import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthenticatedRequest, isJwtPayload } from "../jwt-payload";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or invalid authorization header");
    }

    let payload: unknown;
    try {
      payload = this.jwtService.verify(authHeader.slice(7));
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    if (!isJwtPayload(payload)) throw new UnauthorizedException("Invalid or expired token");

    req.user = payload;
    return true;
  }
}
