import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

@Injectable()
export class DrizzleService implements OnModuleDestroy {
  private client: postgres.Sql;
  db: ReturnType<typeof drizzle>;

  constructor(private readonly config: ConfigService) {
    const databaseUrl = this.config.getOrThrow<string>("DATABASE_URL");
    this.client = postgres(databaseUrl);
    this.db = drizzle(this.client, { schema });
  }

  async onModuleDestroy() {
    await this.client.end();
  }
}
