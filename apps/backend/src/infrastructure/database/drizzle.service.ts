import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { join } from "path";
import * as schema from "./schema";

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private client: postgres.Sql;
  db: ReturnType<typeof drizzle>;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required");
    }

    this.client = postgres(databaseUrl);
    this.db = drizzle(this.client, { schema });
  }

  async onModuleInit() {
    await migrate(this.db, {
      migrationsFolder: join(process.cwd(), "apps/backend/drizzle/migrations"),
    });
  }

  async onModuleDestroy() {
    await this.client.end();
  }
}
