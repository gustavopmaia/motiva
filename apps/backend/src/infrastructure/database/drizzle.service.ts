import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { resolveMigrationsFolder } from "./migrations-folder";
import * as schema from "./schema";

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private client: postgres.Sql;
  db: ReturnType<typeof drizzle>;

  constructor(private readonly config: ConfigService) {
    const databaseUrl = this.config.getOrThrow<string>("DATABASE_URL");
    this.client = postgres(databaseUrl);
    this.db = drizzle(this.client, { schema });
  }

  async onModuleInit() {
    await migrate(this.db, {
      migrationsFolder: resolveMigrationsFolder(),
    });
  }

  async onModuleDestroy() {
    await this.client.end();
  }
}
