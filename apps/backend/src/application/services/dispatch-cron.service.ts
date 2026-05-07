import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DispatchService } from "./dispatch.service";

@Injectable()
export class DispatchCronService {
  private readonly logger = new Logger(DispatchCronService.name);
  private needsReplan = false;
  private isRunning = false;

  constructor(private readonly dispatchService: DispatchService) {}

  markNeedsReplan(): void {
    this.needsReplan = true;
  }

  @Cron("*/5 * * * *")
  async handleDispatchCron(): Promise<void> {
    if (!this.needsReplan || this.isRunning) return;

    this.isRunning = true;
    try {
      this.logger.log({
        action: "dispatch.cron",
        triggered: true,
      });

      await this.dispatchService.runDispatch();
      this.needsReplan = false;
    } finally {
      this.isRunning = false;
    }
  }
}
