import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { existsSync } from "fs";
import postgres from "postgres";
import { resolve } from "path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(url, { max: 1 });
const db = drizzle(client);
const rootMigrations = resolve(process.cwd(), "apps/backend/drizzle/migrations");
const localMigrations = resolve(process.cwd(), "drizzle/migrations");

migrate(db, {
  migrationsFolder: existsSync(rootMigrations) ? rootMigrations : localMigrations,
})
  .then(() => {
    console.log("Migrations applied successfully");
    return client.end();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
