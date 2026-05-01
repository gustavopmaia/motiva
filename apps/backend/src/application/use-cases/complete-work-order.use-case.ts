import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { WorkOrder } from "@domain/entities/work-order.entity";
import { WorkOrderRepository } from "@domain/repositories/work-order.repository";
import { DrizzleService } from "@infrastructure/database/drizzle.service";
import { workOrders, roadSegments, alerts } from "@infrastructure/database/schema";
import { InvalidOperationError, NotFoundError } from "@application/errors";

@Injectable()
export class CompleteWorkOrderUseCase {
  constructor(
    @Inject(WorkOrderRepository)
    private readonly workOrderRepository: WorkOrderRepository,
    private readonly drizzle: DrizzleService,
  ) {}

  async execute(id: string): Promise<WorkOrder> {
    const existing = await this.workOrderRepository.findById(id);
    if (!existing) throw new NotFoundError("Work order not found");
    if (existing.status === "completed") {
      throw new InvalidOperationError("Work order is already completed");
    }

    const now = new Date();
    const startedAt = existing.startedAt ?? now;

    await this.drizzle.db.transaction(async (tx) => {
      await tx
        .update(workOrders)
        .set({ status: "completed", startedAt, completedAt: now })
        .where(eq(workOrders.id, id));
      await tx
        .update(roadSegments)
        .set({ scoreCurrent: 0, scoreDivergent: false })
        .where(eq(roadSegments.id, existing.segmentId));
      await tx.update(alerts).set({ closedAt: now }).where(eq(alerts.id, existing.alertId));
    });

    return new WorkOrder(
      existing.id,
      existing.segmentId,
      existing.alertId,
      "completed",
      existing.priority,
      existing.scoreAtCreation,
      existing.team,
      existing.observation,
      existing.createdAt,
      startedAt,
      now,
    );
  }
}
