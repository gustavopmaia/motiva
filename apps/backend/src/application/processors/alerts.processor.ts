import { Logger } from "@nestjs/common";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Job, Queue } from "bullmq";
import { AlertsService } from "@application/services/alerts.service";
import {
  ALERT_EVENTS_QUEUE,
  ALERT_OPENED_EVENT,
  DEFAULT_JOB_OPTIONS,
  SEGMENT_EVENTS_QUEUE,
  WORK_ORDER_CREATE_JOB,
  CreateWorkOrderJob,
  ProcessReadingResultJob,
} from "@application/jobs/readings-queue.types";

@Processor(SEGMENT_EVENTS_QUEUE)
export class AlertsProcessor extends WorkerHost {
  private readonly logger = new Logger(AlertsProcessor.name);

  constructor(
    private readonly alertsService: AlertsService,
    @InjectQueue(ALERT_EVENTS_QUEUE)
    private readonly alertsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ProcessReadingResultJob>): Promise<void> {
    const { segmentId, score, level, readingId } = job.data;
    try {
      const alert = await this.alertsService.createOrFindOpen(segmentId, level, score);
      const payload: CreateWorkOrderJob = { segmentId, score, level, readingId, alertId: alert.id };
      await this.alertsQueue.add(WORK_ORDER_CREATE_JOB, payload, {
        ...DEFAULT_JOB_OPTIONS,
        jobId: `${WORK_ORDER_CREATE_JOB}:${alert.id}`,
      });
      this.logger.log(
        `job=${job.name} event=${ALERT_OPENED_EVENT} result=${WORK_ORDER_CREATE_JOB}.enqueued segmentId=${segmentId} alertId=${alert.id} readingId=${readingId}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `job=${job.name} failed segmentId=${segmentId} score=${score} level=${level}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
