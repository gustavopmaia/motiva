import { Injectable, Inject } from "@nestjs/common";
import { randomUUID } from "crypto";
import { WorkOrder, WorkOrderPriority } from "@domain/entities/work-order.entity";
import { WorkOrderRepository } from "@domain/repositories/work-order.repository";

export type CreateWorkOrderInput = {
  segmentId: string;
  alertId: string;
  priority: WorkOrderPriority;
  scoreAtCreation: number;
  team?: string | null;
  observation?: string | null;
};

@Injectable()
export class CreateWorkOrderUseCase {
  constructor(
    @Inject(WorkOrderRepository)
    private readonly workOrderRepository: WorkOrderRepository,
  ) {}

  async execute(input: CreateWorkOrderInput): Promise<WorkOrder> {
    const workOrder = new WorkOrder(
      randomUUID(),
      input.segmentId,
      input.alertId,
      "open",
      input.priority,
      input.scoreAtCreation,
      input.team ?? null,
      input.observation ?? null,
    );
    return this.workOrderRepository.save(workOrder);
  }
}
