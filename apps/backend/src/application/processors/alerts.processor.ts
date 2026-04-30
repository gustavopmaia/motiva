import { Inject, Logger } from "@nestjs/common";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Job, Queue } from "bullmq";
import { randomUUID } from "crypto";
import { Alert } from "@domain/entities/alert.entity";
import { AlertRepository } from "@domain/repositories/alert.repository";
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
    @Inject(AlertRepository)
    private readonly alertRepository: AlertRepository,
    @InjectQueue(ALERTS_QUEUE)
    private readonly alertsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ProcessReadingResultJob>): Promise<void> {
    const { segmentId, score, level, readingId } = job.data;
    try {
      const existing = await this.alertRepository.findOpenBySegmentAndLevel(segmentId, level);
      if (existing) return;

      const alert = new Alert(randomUUID(), segmentId, null, level, score, {});
      const saved = await this.alertRepository.save(alert);

      const payload: CreateWorkOrderJob = { segmentId, score, level, readingId, alertId: saved.id };
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
