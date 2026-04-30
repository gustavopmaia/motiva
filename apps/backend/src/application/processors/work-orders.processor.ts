import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { AlertLevel } from "@domain/entities/alert.entity";
import { WorkOrderPriority } from "@domain/entities/work-order.entity";
import { CreateWorkOrderUseCase } from "@application/use-cases/create-work-order.use-case";
import { ALERTS_QUEUE, CreateWorkOrderJob } from "@application/jobs/readings-queue.types";

const LEVEL_TO_PRIORITY: Record<AlertLevel, WorkOrderPriority> = {
  attention: "normal",
  urgent: "urgent",
  critical: "critical",
};

@Processor(ALERTS_QUEUE)
export class WorkOrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkOrdersProcessor.name);

  constructor(private readonly createWorkOrder: CreateWorkOrderUseCase) {
    super();
  }

  async process(job: Job<CreateWorkOrderJob>): Promise<void> {
    const { segmentId, score, level, alertId } = job.data;
    try {
      await this.createWorkOrder.execute({
        segmentId,
        alertId,
        priority: LEVEL_TO_PRIORITY[level],
        scoreAtCreation: score,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to create work order: segmentId=${segmentId} score=${score} level=${level}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
