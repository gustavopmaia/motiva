import { Injectable, Inject } from "@nestjs/common";
import { WorkOrder, WorkOrderStatus } from "@domain/entities/work-order.entity";
import { WorkOrderRepository } from "@domain/repositories/work-order.repository";
import { InvalidOperationError, NotFoundError } from "@application/errors";

export type UpdateWorkOrderInput = {
  status?: WorkOrderStatus;
  team?: string | null;
  observation?: string | null;
};

@Injectable()
export class UpdateWorkOrderUseCase {
  constructor(
    @Inject(WorkOrderRepository)
    private readonly workOrderRepository: WorkOrderRepository,
  ) {}

  async execute(id: string, input: UpdateWorkOrderInput): Promise<WorkOrder> {
    const existing = await this.workOrderRepository.findById(id);
    if (!existing) throw new NotFoundError("Work order not found");
    if (existing.status === "completed") {
      throw new InvalidOperationError("Cannot update a completed work order");
    }

    const newStatus = input.status ?? existing.status;
    const startedAt =
      existing.startedAt === null && newStatus === "in_progress" ? new Date() : existing.startedAt;

    const updated = new WorkOrder(
      existing.id,
      existing.segmentId,
      existing.alertId,
      newStatus,
      existing.priority,
      existing.scoreAtCreation,
      input.team !== undefined ? input.team : existing.team,
      input.observation !== undefined ? input.observation : existing.observation,
      existing.createdAt,
      startedAt,
      existing.completedAt,
    );

    return this.workOrderRepository.update(updated);
  }
}
