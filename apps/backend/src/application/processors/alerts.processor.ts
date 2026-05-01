import { Logger } from "@nestjs/common";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Job, Queue } from "bullmq";
import { AlertsService } from "@application/services/alerts.service";
import {
  ALERTS_QUEUE,
  READINGS_QUEUE,
  CreateWorkOrderJob,
  ProcessReadingResultJob,
} from "@application/jobs/readings-queue.types";

@Processor(READINGS_QUEUE)
export class AlertsProcessor extends WorkerHost {
  private readonly logger = new Logger(AlertsProcessor.name);

  constructor(
    private readonly alertsService: AlertsService,
    @InjectQueue(ALERTS_QUEUE)
    private readonly alertsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ProcessReadingResultJob>): Promise<void> {
    const { segmentId, score, level, readingId } = job.data;
    try {
      const alert = await this.alertsService.createOrFindOpen(segmentId, level, score);
      const payload: CreateWorkOrderJob = { segmentId, score, level, readingId, alertId: alert.id };
      await this.alertsQueue.add("create-work-order", payload);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process reading result: segmentId=${segmentId} score=${score} level=${level}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
