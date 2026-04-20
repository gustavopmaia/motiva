import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

@Injectable()
export class DrizzleService implements OnModuleDestroy {
  private client: postgres.Sql;
  db: ReturnType<typeof drizzle>;

  constructor() {
    this.client = postgres(process.env.DATABASE_URL!);
    this.db = drizzle(this.client, { schema });
  }

  async onModuleDestroy() {
    await this.client.end();
  }
}
