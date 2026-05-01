import { Injectable, Logger } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { Team } from "@domain/entities/team.entity";
import { WorkOrderPriority } from "@domain/entities/work-order.entity";
import { DrizzleService } from "@infrastructure/database/drizzle.service";
import { routeItems, routes, teams } from "@infrastructure/database/schema";

type DispatchWorkOrder = {
  id: string;
  segmentId: string;
  roadName: string;
  priority: WorkOrderPriority;
  createdAt: Date;
  kmStart: number;
  kmEnd: number;
};

type DispatchWorkOrderRow = {
  id: string;
  segment_id: string;
  road_name: string;
  priority: string;
  created_at: Date;
  km_start: string;
  km_end: string;
};

const PRIORITY_WEIGHT: Record<WorkOrderPriority, number> = {
  critical: 0,
  urgent: 1,
  attention: 2,
};

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(private readonly drizzle: DrizzleService) {}

  async runDispatch(): Promise<void> {
    const [workOrders, activeTeams] = await Promise.all([
      this.findDispatchableWorkOrders(),
      this.findActiveTeams(),
    ]);
    const workOrdersByTeam = new Map<string, DispatchWorkOrder[]>();
    let totalUncovered = 0;

    for (const workOrder of workOrders) {
      const responsibleTeam = findResponsibleTeam(workOrder, activeTeams);

      if (!responsibleTeam) {
        totalUncovered += 1;
        this.logger.warn({
          action: "dispatch.uncovered_work_order",
          workOrderId: workOrder.id,
          segmentId: workOrder.segmentId,
        });
        continue;
      }

      const teamWorkOrders = workOrdersByTeam.get(responsibleTeam.id) ?? [];
      teamWorkOrders.push(workOrder);
      workOrdersByTeam.set(responsibleTeam.id, teamWorkOrders);
    }

    let totalRoutesCreated = 0;

    await this.drizzle.db.transaction(async (tx) => {
      await tx.execute(sql`
        DELETE FROM route_items
        WHERE route_id IN (
          SELECT id FROM routes WHERE status != 'locked'
        )
      `);
      await tx.execute(sql`DELETE FROM routes WHERE status != 'locked'`);

      if (workOrders.length === 0 || activeTeams.length === 0) return;

      for (const team of activeTeams) {
        const sortedWorkOrders = sortWorkOrders(workOrdersByTeam.get(team.id) ?? []);
        if (sortedWorkOrders.length === 0) continue;

        const capacity = Math.max(0, team.capacityPerDay);
        if (capacity === 0) continue;

        let dayOffset = 0;
        for (let cursor = 0; cursor < sortedWorkOrders.length; cursor += capacity) {
          const batch = sortedWorkOrders.slice(cursor, cursor + capacity);
          const date = dateFromToday(dayOffset);

          const routeId = randomUUID();
          await tx.insert(routes).values({
            id: routeId,
            teamId: team.id,
            date,
            status: "pending_approval",
            createdAt: new Date(),
          });

          await tx.insert(routeItems).values(
            batch.map((workOrder, index) => ({
              id: randomUUID(),
              routeId,
              workOrderId: workOrder.id,
              orderIndex: index,
              createdAt: new Date(),
            })),
          );

          totalRoutesCreated += 1;
          dayOffset += 1;
        }
      }
    });

    this.logger.log({
      action: "dispatch.run",
      totalWorkOrders: workOrders.length,
      totalUncovered,
      totalRoutesCreated,
    });
  }

  private async findDispatchableWorkOrders(): Promise<DispatchWorkOrder[]> {
    const rows = await this.drizzle.db.execute<DispatchWorkOrderRow>(sql`
      SELECT
        wo.id,
        wo.segment_id,
        rs.road_name,
        wo.priority,
        wo.created_at,
        rs.km_start,
        rs.km_end
      FROM work_orders wo
      INNER JOIN road_segments rs ON rs.id = wo.segment_id
      WHERE wo.status != 'completed'
        AND NOT EXISTS (
          SELECT 1
          FROM route_items ri
          INNER JOIN routes r ON r.id = ri.route_id
          WHERE ri.work_order_id = wo.id
            AND r.status = 'locked'
        )
    `);

    return rows.map((row) => ({
      id: row.id,
      segmentId: row.segment_id,
      roadName: row.road_name,
      priority: row.priority as WorkOrderPriority,
      createdAt: row.created_at,
      kmStart: Number(row.km_start),
      kmEnd: Number(row.km_end),
    }));
  }

  private async findActiveTeams(): Promise<Team[]> {
    const rows = await this.drizzle.db
      .select()
      .from(teams)
      .where(eq(teams.active, true))
      .orderBy(asc(teams.name));

    return rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        baseLat: row.baseLat,
        baseLng: row.baseLng,
        roadName: row.roadName,
        kmStart: Number(row.kmStart),
        kmEnd: Number(row.kmEnd),
        capacityPerDay: row.capacityPerDay,
        active: row.active,
      }))
      .filter((team) => team.capacityPerDay > 0);
  }
}

function sortWorkOrders(workOrders: DispatchWorkOrder[]): DispatchWorkOrder[] {
  return [...workOrders].sort((a, b) => {
    const priority = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (priority !== 0) return priority;

    const createdAt = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdAt !== 0) return createdAt;

    return a.kmStart - b.kmStart;
  });
}

function findResponsibleTeam(workOrder: DispatchWorkOrder, activeTeams: Team[]): Team | undefined {
  return activeTeams.find(
    (team) =>
      team.roadName === workOrder.roadName &&
      rangesOverlap(workOrder.kmStart, workOrder.kmEnd, team.kmStart, team.kmEnd),
  );
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA <= endB && endA >= startB;
}

function dateFromToday(dayOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}
