import { USER_ROLES, UserRole } from "./user.entity";

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
};

export type AuthenticatedRequest = {
  headers: { authorization?: string };
  user: JwtPayload;
};

export function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== "object" || value === null) return false;

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === "string" &&
    typeof payload.email === "string" &&
    typeof payload.role === "string" &&
    (USER_ROLES as readonly string[]).includes(payload.role)
  );
}
