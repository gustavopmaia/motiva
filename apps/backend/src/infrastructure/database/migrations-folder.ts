import { existsSync } from "fs";
import { resolve } from "path";

export function resolveMigrationsFolder() {
  const candidates = [
    resolve(process.cwd(), "apps/backend/drizzle/migrations"),
    resolve(process.cwd(), "drizzle/migrations"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}
