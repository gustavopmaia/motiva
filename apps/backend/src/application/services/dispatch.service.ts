import { Injectable, Logger } from "@nestjs/common";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { Team } from "@domain/entities/team.entity";
import { WorkOrderPriority } from "@domain/entities/work-order.entity";
import { DrizzleService } from "@infrastructure/database/drizzle.service";
import {
  routeItems,
  routes,
  teams,
  workOrders as workOrdersTable,
} from "@infrastructure/database/schema";

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
    const [workOrders, activeTeams, busyTeamNames] = await Promise.all([
      this.findDispatchableWorkOrders(),
      this.findActiveTeams(),
      this.findBusyTeamNames(),
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
    let totalTeamsSkipped = 0;

    // Process each team independently so a busy team's routes are never touched
    for (const team of activeTeams) {
      if (busyTeamNames.has(team.name)) {
        // A field user on this team has at least one in_progress work order — leave
        // their current route alone until all active work is completed or reset to open.
        totalTeamsSkipped += 1;
        this.logger.log({
          action: "dispatch.team_skipped",
          reason: "in_progress_work_orders",
          teamId: team.id,
          teamName: team.name,
        });
        continue;
      }

      const sortedWorkOrders = sortWorkOrders(workOrdersByTeam.get(team.id) ?? []);

      await this.drizzle.db.transaction(async (tx) => {
        // Clear team assignment for work orders that are in this team's non-locked
        // routes and will be re-planned. Skip work orders also in a locked route.
        await tx.execute(sql`
          UPDATE work_orders
          SET team = NULL
          WHERE id IN (
            SELECT ri.work_order_id
            FROM route_items ri
            JOIN routes r ON r.id = ri.route_id
            WHERE r.team_id = ${team.id}
              AND r.status != 'locked'
          )
          AND id NOT IN (
            SELECT ri.work_order_id
            FROM route_items ri
            JOIN routes r ON r.id = ri.route_id
            WHERE r.status = 'locked'
          )
        `);

        await tx.execute(sql`
          DELETE FROM route_items
          WHERE route_id IN (
            SELECT id FROM routes WHERE team_id = ${team.id} AND status != 'locked'
          )
        `);
        await tx.execute(sql`
          DELETE FROM routes WHERE team_id = ${team.id} AND status != 'locked'
        `);

        if (sortedWorkOrders.length === 0) return;

        const capacity = Math.max(0, team.capacityPerDay);
        if (capacity === 0) return;

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

          // Write the team name onto the work orders so field users can find them
          await tx
            .update(workOrdersTable)
            .set({ team: team.name })
            .where(
              inArray(
                workOrdersTable.id,
                batch.map((wo) => wo.id),
              ),
            );

          totalRoutesCreated += 1;
          dayOffset += 1;
        }
      });
    }

    this.logger.log({
      action: "dispatch.run",
      totalWorkOrders: workOrders.length,
      totalUncovered,
      totalRoutesCreated,
      totalTeamsSkipped,
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
      WHERE wo.status = 'open'
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

  private async findBusyTeamNames(): Promise<Set<string>> {
    const rows = await this.drizzle.db.execute<{ team: string }>(sql`
      SELECT DISTINCT team
      FROM work_orders
      WHERE status = 'in_progress' AND team IS NOT NULL
    `);
    return new Set(rows.map((r) => r.team));
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
      workOrder.kmStart <= team.kmEnd &&
      workOrder.kmEnd >= team.kmStart,
  );
}

function dateFromToday(dayOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}
