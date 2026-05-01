import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { AlertLevel } from "@domain/entities/alert.entity";
import { WorkOrderPriority } from "@domain/entities/work-order.entity";
import { AlertsService } from "@application/services/alerts.service";
import { WorkOrdersService } from "@application/services/work-orders.service";
import { ALERT_EVENTS_QUEUE, CreateWorkOrderJob } from "@application/jobs/readings-queue.types";

const LEVEL_TO_PRIORITY: Record<AlertLevel, WorkOrderPriority> = {
  attention: "attention",
  urgent: "urgent",
  critical: "critical",
};

@Processor(ALERT_EVENTS_QUEUE)
export class WorkOrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkOrdersProcessor.name);

  constructor(
    private readonly workOrdersService: WorkOrdersService,
    private readonly alertsService: AlertsService,
  ) {
    super();
  }

  async process(job: Job<CreateWorkOrderJob>): Promise<void> {
    const { segmentId, score, level, alertId } = job.data;
    try {
      const workOrder = await this.workOrdersService.create({
        segmentId,
        alertId,
        priority: LEVEL_TO_PRIORITY[level],
        scoreAtCreation: score,
      });
      await this.alertsService.updateOsId(alertId, workOrder.id);
      this.logger.log(
        `job=${job.name} result=work-order.ready segmentId=${segmentId} alertId=${alertId} workOrderId=${workOrder.id}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `job=${job.name} failed segmentId=${segmentId} alertId=${alertId} score=${score} level=${level}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
