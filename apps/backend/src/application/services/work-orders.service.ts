import { Injectable } from "@nestjs/common";
import { and, desc, eq, SQL } from "drizzle-orm";
import { randomUUID } from "crypto";
import { WorkOrder, WorkOrderPriority, WorkOrderStatus } from "@domain/entities/work-order.entity";
import { InvalidOperationError, NotFoundError } from "@application/errors";
import { DrizzleService } from "@infrastructure/database/drizzle.service";
import { alerts, roadSegments, workOrders } from "@infrastructure/database/schema";

export type WorkOrderFilters = {
  status?: WorkOrderStatus;
  team?: string;
};

export type CreateWorkOrderInput = {
  segmentId: string;
  alertId: string;
  priority: WorkOrderPriority;
  scoreAtCreation: number;
  team?: string | null;
  observation?: string | null;
};

export type UpdateWorkOrderInput = {
  status?: WorkOrderStatus;
  team?: string | null;
  observation?: string | null;
};

@Injectable()
export class WorkOrdersService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(filters: WorkOrderFilters): Promise<WorkOrder[]> {
    const conditions: SQL[] = [];
    if (filters.status) conditions.push(eq(workOrders.status, filters.status));
    if (filters.team) conditions.push(eq(workOrders.team, filters.team));

    const rows = await this.drizzle.db
      .select()
      .from(workOrders)
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(desc(workOrders.createdAt));

    return rows.map(toWorkOrder);
  }

  async create(input: CreateWorkOrderInput): Promise<WorkOrder> {
    const [saved] = await this.drizzle.db
      .insert(workOrders)
      .values({
        id: randomUUID(),
        segmentId: input.segmentId,
        alertId: input.alertId,
        status: "open",
        priority: input.priority,
        scoreAtCreation: input.scoreAtCreation,
        team: input.team ?? null,
        observation: input.observation ?? null,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
      })
      .returning();

    return toWorkOrder(saved);
  }

  async update(id: string, input: UpdateWorkOrderInput): Promise<WorkOrder> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError("Work order not found");
    if (existing.status === "completed") {
      throw new InvalidOperationError("Cannot update a completed work order");
    }

    const newStatus = input.status ?? existing.status;
    const startedAt =
      existing.startedAt === null && newStatus === "in_progress" ? new Date() : existing.startedAt;

    const [updated] = await this.drizzle.db
      .update(workOrders)
      .set({
        status: newStatus,
        team: input.team !== undefined ? input.team : existing.team,
        observation: input.observation !== undefined ? input.observation : existing.observation,
        startedAt,
        completedAt: existing.completedAt,
      })
      .where(eq(workOrders.id, id))
      .returning();

    return toWorkOrder(updated);
  }

  async complete(id: string): Promise<WorkOrder> {
    const existing = await this.findById(id);
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

    return {
      ...existing,
      status: "completed",
      startedAt,
      completedAt: now,
    };
  }

  private async findById(id: string): Promise<WorkOrder | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .limit(1);

    return row ? toWorkOrder(row) : null;
  }
}

function toWorkOrder(row: typeof workOrders.$inferSelect): WorkOrder {
  return {
    id: row.id,
    segmentId: row.segmentId,
    alertId: row.alertId,
    status: row.status as WorkOrderStatus,
    priority: row.priority as WorkOrderPriority,
    scoreAtCreation: row.scoreAtCreation,
    team: row.team,
    observation: row.observation,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}
