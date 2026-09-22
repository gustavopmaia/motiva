import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DispatchService } from "./dispatch.service";
import { DrizzleService } from "../database/drizzle.service";
import { requestReplanning } from "../modules/planning/public";

@Injectable()
export class DispatchCronService {
  private readonly logger = new Logger(DispatchCronService.name);
  private running = false;
  constructor(
    private readonly dispatchService: DispatchService,
    private readonly drizzle: DrizzleService,
  ) {}
  async markNeedsReplan(): Promise<void> {
    await this.drizzle.transaction((tx) => requestReplanning(tx));
  }
  @Cron("*/5 * * * *")
  async handleDispatchCron(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatchService.runDispatch(true);
    } catch (error) {
      this.logger.error({
        action: "dispatch.failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    } finally {
      this.running = false;
    }
  }
}
