import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Cron } from "@nestjs/schedule";
import { Queue } from "bullmq";
import { DispatchService } from "./dispatch.service";
import { SEGMENT_EVENTS_QUEUE } from "../common/queues";

const REPLAN_FLAG = "dispatch:needs-replan";
const REPLAN_LOCK = "dispatch:lock";
const LOCK_TTL_SECONDS = 300;

@Injectable()
export class DispatchCronService {
  private readonly logger = new Logger(DispatchCronService.name);

  constructor(
    private readonly dispatchService: DispatchService,
    @InjectQueue(SEGMENT_EVENTS_QUEUE)
    private readonly queue: Queue,
  ) {}

  async markNeedsReplan(): Promise<void> {
    const redis = await this.queue.client;
    await redis.set(REPLAN_FLAG, "1");
  }

  @Cron("*/5 * * * *")
  async handleDispatchCron(): Promise<void> {
    const redis = await this.queue.client;

    const locked = await redis.set(REPLAN_LOCK, "1", "EX", LOCK_TTL_SECONDS, "NX");
    if (!locked) return;

    try {
      if (!(await redis.getdel(REPLAN_FLAG))) return;

      this.logger.log({ action: "dispatch.cron", triggered: true });
      await this.dispatchService.runDispatch();
    } catch (error: unknown) {
      await redis.set(REPLAN_FLAG, "1");
      throw error;
    } finally {
      await redis.del(REPLAN_LOCK);
    }
  }
}
