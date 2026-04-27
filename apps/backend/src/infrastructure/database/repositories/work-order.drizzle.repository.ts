import { Injectable } from "@nestjs/common";
import { and, desc, eq, SQL } from "drizzle-orm";
import { WorkOrder, WorkOrderPriority, WorkOrderStatus } from "@domain/entities/work-order.entity";
import { WorkOrderRepository, WorkOrderFilters } from "@domain/repositories/work-order.repository";
import { DrizzleService } from "../drizzle.service";
import { workOrders } from "../schema";

@Injectable()
export class WorkOrderDrizzleRepository implements WorkOrderRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async save(workOrder: WorkOrder): Promise<WorkOrder> {
    const [saved] = await this.drizzle.db
      .insert(workOrders)
      .values({
        id: workOrder.id,
        segmentId: workOrder.segmentId,
        alertId: workOrder.alertId,
        status: workOrder.status,
        priority: workOrder.priority,
        scoreAtCreation: workOrder.scoreAtCreation,
        team: workOrder.team,
        observation: workOrder.observation,
        createdAt: workOrder.createdAt,
        startedAt: workOrder.startedAt,
        completedAt: workOrder.completedAt,
      })
      .returning();
    return this.toEntity(saved);
  }

  async findById(id: string): Promise<WorkOrder | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findAll(filters: WorkOrderFilters): Promise<WorkOrder[]> {
    const conditions: SQL[] = [];
    if (filters.status) conditions.push(eq(workOrders.status, filters.status));
    if (filters.team) conditions.push(eq(workOrders.team, filters.team));

    const rows = await this.drizzle.db
      .select()
      .from(workOrders)
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(desc(workOrders.createdAt));

    return rows.map((row) => this.toEntity(row));
  }

  async update(workOrder: WorkOrder): Promise<WorkOrder> {
    const [updated] = await this.drizzle.db
      .update(workOrders)
      .set({
        status: workOrder.status,
        team: workOrder.team,
        observation: workOrder.observation,
        startedAt: workOrder.startedAt,
        completedAt: workOrder.completedAt,
      })
      .where(eq(workOrders.id, workOrder.id))
      .returning();
    return this.toEntity(updated);
  }

  private toEntity(row: typeof workOrders.$inferSelect): WorkOrder {
    return new WorkOrder(
      row.id,
      row.segmentId,
      row.alertId,
      row.status as WorkOrderStatus,
      row.priority as WorkOrderPriority,
      row.scoreAtCreation,
      row.team,
      row.observation,
      row.createdAt,
      row.startedAt,
      row.completedAt,
    );
  }
}
