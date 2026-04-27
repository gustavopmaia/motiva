import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { existsSync } from "fs";
import postgres from "postgres";
import { resolve } from "path";

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write("DATABASE_URL is not set\n");
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
    process.stdout.write("Migrations applied successfully\n");
    return client.end();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`Migration failed: ${String(err)}\n`);
    process.exit(1);
  });
