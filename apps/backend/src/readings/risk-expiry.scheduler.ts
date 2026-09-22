import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../database/drizzle.service";
import { FusionService } from "./fusion.service";
@Injectable()
export class RiskExpiryScheduler {
  private running = false;
  private readonly logger = new Logger(RiskExpiryScheduler.name);
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly fusion: FusionService,
  ) {}
  @Interval(60_000)
  async expire(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.drizzle.transaction(async (tx) => {
        const rows = await tx.execute<{ id: string }>(
          sql`SELECT id FROM road_segments WHERE risk_valid_until <= clock_timestamp() ORDER BY risk_valid_until LIMIT 100 FOR UPDATE SKIP LOCKED`,
        );
        for (const row of rows)
          await this.fusion.updateScoreForSegment(row.id, `expiry-${row.id}`, tx);
      });
    } catch {
      this.logger.error({ action: "risk.expiry_failed" });
    } finally {
      this.running = false;
    }
  }
}
