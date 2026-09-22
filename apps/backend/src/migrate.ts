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

async function run(): Promise<void> {
  try {
    // max:1 pins the advisory lock and migrator to the same session.
    await client`SELECT pg_advisory_lock(734627, 1)`;
    await migrate(db, {
      migrationsFolder: existsSync(rootMigrations) ? rootMigrations : localMigrations,
    });
    process.stdout.write("Migrations applied successfully\n");
  } finally {
    try {
      await client`SELECT pg_advisory_unlock(734627, 1)`;
    } finally {
      await client.end();
    }
  }
}
run().catch((error) => {
  process.stderr.write(`Migration failed: ${String(error)}\n`);
  process.exitCode = 1;
});
