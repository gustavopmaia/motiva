import { transactionRetries } from "../platform/telemetry/operations";
import type { Transaction } from "../platform/persistence/transaction";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

@Injectable()
export class DrizzleService implements OnModuleDestroy {
  private readonly client: postgres.Sql;
  readonly db: ReturnType<typeof drizzle>;

  constructor(private readonly config: ConfigService) {
    const databaseUrl = this.config.getOrThrow<string>("DATABASE_URL");
    this.client = postgres(databaseUrl, {
      max: Number(this.config.get?.("DB_POOL_MAX") ?? 10),
      connect_timeout: Number(this.config.get?.("DB_CONNECT_TIMEOUT_SECONDS") ?? 10),
      idle_timeout: 30,
      connection: { statement_timeout: 30000, lock_timeout: 5000 },
    });
    this.db = drizzle(this.client, { schema });
  }

  async transaction<T>(action: (tx: Transaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.transaction(action);
      } catch (error) {
        const code =
          (error as { code?: string; cause?: { code?: string } }).code ??
          (error as { cause?: { code?: string } }).cause?.code;
        if (!["40P01", "40001", "55P03"].includes(code ?? "") || attempt >= 2) throw error;
        transactionRetries.inc({ code });
        await new Promise((resolve) =>
          setTimeout(resolve, 25 * (attempt + 1) + Math.random() * 50),
        );
      }
    }
  }

  async onModuleDestroy() {
    await this.client.end();
  }
}
