import { WorkOrder } from "@domain/entities/work-order.entity";
import { WorkOrderRepository } from "@domain/repositories/work-order.repository";
import { RoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { InvalidOperationError, NotFoundError } from "@application/errors";

export class CompleteWorkOrderUseCase {
  constructor(
    private readonly workOrderRepository: WorkOrderRepository,
    private readonly roadSegmentRepository: RoadSegmentRepository,
  ) {}

  async execute(id: string): Promise<WorkOrder> {
    const existing = await this.workOrderRepository.findById(id);
    if (!existing) throw new NotFoundError("Work order not found");
    if (existing.status === "completed") {
      throw new InvalidOperationError("Work order is already completed");
    }

    const completed = new WorkOrder(
      existing.id,
      existing.segmentId,
      existing.alertId,
      "completed",
      existing.priority,
      existing.scoreAtCreation,
      existing.team,
      existing.observation,
      existing.createdAt,
      existing.startedAt ?? new Date(),
      new Date(),
    );

    const saved = await this.workOrderRepository.update(completed);
    await this.roadSegmentRepository.updateScore(existing.segmentId, 0, false);

    return saved;
  }
}
