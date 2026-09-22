import { and, desc, eq, isNull, ne, sql, SQL } from "drizzle-orm";
import { randomUUID } from "crypto";
import { AuthorizationError, InvalidOperationError, NotFoundError } from "../../../common/errors";
import { DrizzleService } from "../../../database/drizzle.service";
import { alerts, roadSegments, workOrders } from "../../../database/schema";
import { Transaction, Database } from "../../../platform/persistence/transaction";
import { requestSegmentReplanning } from "../../planning/public";
import { recordMaintenanceAction } from "./audit";
import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderActor,
  WorkOrderFilters,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from "../domain/work-order";
import { WorkOrderCommandsRepository, WorkOrderContext } from "../application/work-order.ports";
export class DrizzleWorkOrdersRepository implements WorkOrderCommandsRepository {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly transaction?: Transaction,
  ) {}
  async withOrder(
    id: string,
    actor: WorkOrderActor,
    action: (context: WorkOrderContext) => Promise<WorkOrder>,
  ): Promise<WorkOrder> {
    const run = async (tx: Transaction) => {
      const order = await this.lockOrder(tx, id);
      return action({
        order,
        assertAccess: () => this.assertAccess(tx, actor, order),
        update: (input) => this.updateLocked(tx, order, input, actor),
        complete: () => this.completeLocked(tx, order, actor),
      });
    };
    return this.transaction ? run(this.transaction) : this.drizzle.transaction(run);
  }
  async findAll(filters: WorkOrderFilters, actor: WorkOrderActor): Promise<WorkOrder[]> {
    const conditions: SQL[] = [];
    if (actor.role === "field")
      conditions.push(sql`EXISTS (
      SELECT 1 FROM team_members tm JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ${actor.sub} AND t.id = ${workOrders.teamId} AND t.active = true
    )`);
    if (filters.status) conditions.push(eq(workOrders.status, filters.status));
    if (filters.team) conditions.push(eq(workOrders.team, filters.team));

    const rows = await this.drizzle.db
      .select()
      .from(workOrders)
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(desc(workOrders.createdAt));

    return rows.map(toWorkOrder);
  }

  async create(
    input: CreateWorkOrderInput,
    actor: WorkOrderActor,
    transaction: Transaction | undefined = this.transaction,
  ): Promise<WorkOrder> {
    if (!transaction) return this.drizzle.transaction((tx) => this.create(input, actor, tx));
    const db = transaction;
    await db.execute(sql`SELECT id FROM road_segments WHERE id = ${input.segmentId} FOR UPDATE`);
    const [alert] = await db.execute<{ id: string; closed_at: Date | null }>(
      sql`SELECT id, closed_at FROM alerts WHERE id = ${input.alertId} AND segment_id = ${input.segmentId} FOR UPDATE`,
    );
    if (!alert) throw new NotFoundError("Alert does not belong to road segment");
    const existing = await this.findByAlertId(input.alertId, db);
    if (existing) return existing;
    if (alert.closed_at)
      throw new InvalidOperationError("Cannot create a work order for a closed alert");

    const teamId = await this.resolveTeam(db, input.team ?? null);
    const [saved] = await db
      .insert(workOrders)
      .values({
        id: randomUUID(),
        segmentId: input.segmentId,
        alertId: input.alertId,
        status: "open",
        priority: input.priority,
        scoreAtCreation: input.scoreAtCreation,
        teamId,
        observation: input.observation ?? null,
        location: input.location ?? null,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
      })
      .onConflictDoNothing({ target: workOrders.alertId })
      .returning();

    if (saved) {
      await db.execute(sql`UPDATE alerts SET os_id = ${saved.id} WHERE id = ${input.alertId}`);
      await requestSegmentReplanning(transaction, input.segmentId);
      await recordMaintenanceAction(transaction, actor.sub, "work-order.created", saved.id, {
        alertId: input.alertId,
        segmentId: input.segmentId,
      });
      return toWorkOrder(saved);
    }

    const createdByConcurrentJob = await this.findByAlertId(input.alertId, db);
    if (createdByConcurrentJob) return createdByConcurrentJob;

    throw new Error("Failed to create or find work order for alert");
  }

  private async updateLocked(
    tx: Transaction,
    existing: WorkOrder,
    input: UpdateWorkOrderInput,
    actor: WorkOrderActor,
  ): Promise<WorkOrder> {
    const id = existing.id;
    const status = input.status ?? existing.status;
    let teamId: string | null | undefined;
    if (input.team !== undefined && input.team !== existing.team) {
      teamId = await this.resolveTeam(tx, input.team);
      const [route] = await tx.execute<{ team_id: string }>(
        sql`SELECT r.team_id FROM route_items ri JOIN routes r ON r.id = ri.route_id WHERE ri.work_order_id = ${id}`,
      );
      if (route && route.team_id !== teamId)
        throw new InvalidOperationError(
          "Remove the work order from its route before assigning another team",
        );
    }
    if (teamId !== undefined) await requestSegmentReplanning(tx, existing.segmentId);
    const [updated] = await tx
      .update(workOrders)
      .set({
        status,
        ...(teamId !== undefined ? { teamId } : {}),
        observation: input.observation !== undefined ? input.observation : existing.observation,
        location: input.location !== undefined ? input.location : existing.location,
        startedAt: existing.startedAt ?? (status === "in_progress" ? new Date() : null),
      })
      .where(eq(workOrders.id, id))
      .returning();
    if (status !== existing.status || (input.team !== undefined && input.team !== existing.team))
      await requestSegmentReplanning(tx, existing.segmentId);
    await recordMaintenanceAction(tx, actor.sub, "work-order.updated", id, {
      previousTeam: existing.team,
      previousStatus: existing.status,
      status,
      team: updated.team,
    });
    return toWorkOrder(updated);
  }

  private async completeLocked(
    tx: Transaction,
    existing: WorkOrder,
    actor: WorkOrderActor,
  ): Promise<WorkOrder> {
    const id = existing.id;
    const now = new Date();
    const startedAt = existing.startedAt ?? now;
    await tx
      .update(workOrders)
      .set({ status: "completed", startedAt, completedAt: now })
      .where(eq(workOrders.id, id));
    await tx
      .update(workOrders)
      .set({ status: "completed", completedAt: now })
      .where(
        and(
          eq(workOrders.segmentId, existing.segmentId),
          ne(workOrders.id, id),
          ne(workOrders.status, "completed"),
        ),
      );
    await tx
      .update(roadSegments)
      .set({ scoreCurrent: 0, scoreDivergent: false })
      .where(eq(roadSegments.id, existing.segmentId));
    await tx.execute(
      sql`UPDATE road_segments SET last_intervention_at = ${now.toISOString()}::timestamptz, risk_version = risk_version + 1, risk_valid_until = NULL, risk_contributions = '[]'::jsonb WHERE id = ${existing.segmentId}`,
    );
    await tx
      .update(alerts)
      .set({ closedAt: now })
      .where(and(eq(alerts.segmentId, existing.segmentId), isNull(alerts.closedAt)));
    await requestSegmentReplanning(tx, existing.segmentId);
    await recordMaintenanceAction(tx, actor.sub, "work-order.completed", id, {
      segmentId: existing.segmentId,
      completedAt: now.toISOString(),
    });
    return { ...existing, status: "completed", startedAt, completedAt: now };
  }

  private async resolveTeam(tx: Transaction, name: string | null): Promise<string | null> {
    if (name === null) return null;
    const rows = await tx.execute<{ id: string }>(
      sql`SELECT id FROM teams WHERE name = ${name} ORDER BY id LIMIT 2 FOR SHARE`,
    );
    if (rows.length !== 1)
      throw new InvalidOperationError("Team name must identify exactly one team");
    return rows[0].id;
  }

  async lockOrder(tx: Transaction, id: string): Promise<WorkOrder> {
    const [reference] = await tx
      .select({ segmentId: workOrders.segmentId, teamId: workOrders.teamId })
      .from(workOrders)
      .where(eq(workOrders.id, id));
    if (!reference) throw new NotFoundError("Work order not found");
    if (reference.teamId)
      await tx.execute(sql`SELECT id FROM teams WHERE id = ${reference.teamId} FOR SHARE`);
    // Shared ordering for maintenance and monitoring: segment before work order.
    await tx.execute(
      sql`SELECT id FROM road_segments WHERE id = ${reference.segmentId} FOR UPDATE`,
    );
    const [row] = await tx.select().from(workOrders).where(eq(workOrders.id, id)).for("update");
    if (!row) throw new NotFoundError("Work order not found");
    if (row.teamId !== reference.teamId) {
      const error = new Error("Assignment changed; retry transaction") as Error & { code: string };
      error.code = "40001";
      throw error;
    }
    return toWorkOrder(row);
  }

  async assertAccess(tx: Transaction, actor: WorkOrderActor, order: WorkOrder): Promise<void> {
    if (actor.role === "manager" || actor.role === "system") return;
    const [membership] = await tx.execute(sql`
      SELECT tm.id FROM team_members tm JOIN teams t ON t.id = tm.team_id
      JOIN work_orders wo ON wo.team_id = t.id
      WHERE tm.user_id = ${actor.sub} AND wo.id = ${order.id} AND t.active = true
      FOR SHARE OF tm, t
    `);
    if (!membership)
      throw new AuthorizationError("You can only modify work orders assigned to your team");
  }

  async findById(id: string): Promise<WorkOrder | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .limit(1);

    return row ? toWorkOrder(row) : null;
  }

  private async findByAlertId(
    alertId: string,
    db: Database = this.drizzle.db,
  ): Promise<WorkOrder | null> {
    const [row] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.alertId, alertId))
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
    location: row.location as WorkOrder["location"],
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}
