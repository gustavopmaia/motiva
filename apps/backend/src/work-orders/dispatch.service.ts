import { Injectable, Logger } from "@nestjs/common";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { Team } from "../teams/team.entity";
import { WorkOrderPriority } from "./work-order.entity";
import { DrizzleService } from "../database/drizzle.service";
import { routeItems, routes, teams, workOrders as workOrdersTable } from "../database/schema";

export type DispatchWorkOrder = {
  id: string;
  segmentId: string;
  roadName: string;
  priority: WorkOrderPriority;
  createdAt: Date;
  kmStart: number;
  kmEnd: number;
};

type DispatchWorkOrderRow = Omit<
  DispatchWorkOrder,
  "kmStart" | "kmEnd" | "priority" | "createdAt"
> & {
  priority: string;
  createdAt: string;
  kmStart: string;
  kmEnd: string;
};

const PRIORITY_WEIGHT: Record<WorkOrderPriority, number> = {
  critical: 0,
  urgent: 1,
  attention: 2,
};

const MAX_ROUTE_SPAN_KM = 30;

type Tx = Parameters<Parameters<DrizzleService["db"]["transaction"]>[0]>[0];

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
        this.logger.warn(
          `action=dispatch.uncovered_work_order workOrderId=${workOrder.id} segmentId=${workOrder.segmentId}`,
        );
        continue;
      }

      const teamWorkOrders = workOrdersByTeam.get(responsibleTeam.id) ?? [];
      teamWorkOrders.push(workOrder);
      workOrdersByTeam.set(responsibleTeam.id, teamWorkOrders);
    }

    let totalRoutesCreated = 0;
    let totalTeamsSkipped = 0;

    for (const team of activeTeams) {
      if (busyTeamNames.has(team.name)) {
        totalTeamsSkipped += 1;
        this.logger.log(
          `action=dispatch.team_skipped reason=in_progress_work_orders teamId=${team.id} teamName=${team.name}`,
        );
        continue;
      }

      const capacity = Math.max(0, team.capacityPerDay);
      const batches =
        capacity > 0 ? buildGeographicBatches(workOrdersByTeam.get(team.id) ?? [], capacity) : [];

      await this.replanTeamRoutes(team, batches);
      totalRoutesCreated += batches.length;
    }

    this.logger.log(
      `action=dispatch.run totalWorkOrders=${workOrders.length} totalUncovered=${totalUncovered} totalRoutesCreated=${totalRoutesCreated} totalTeamsSkipped=${totalTeamsSkipped}`,
    );
  }

  private async replanTeamRoutes(team: Team, batches: DispatchWorkOrder[][]): Promise<void> {
    await this.drizzle.db.transaction(async (tx) => {
      await this.clearOpenRoutes(tx, team.id);

      for (const [dayOffset, batch] of batches.entries()) {
        await this.createRoute(tx, team, batch, dateFromToday(dayOffset));
      }
    });
  }

  private async clearOpenRoutes(tx: Tx, teamId: string): Promise<void> {
    await tx.execute(sql`
      UPDATE work_orders
      SET team = NULL
      WHERE id IN (
        SELECT ri.work_order_id
        FROM route_items ri
        JOIN routes r ON r.id = ri.route_id
        WHERE r.team_id = ${teamId}
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
        SELECT id FROM routes WHERE team_id = ${teamId} AND status != 'locked'
      )
    `);
    await tx.execute(sql`
      DELETE FROM routes WHERE team_id = ${teamId} AND status != 'locked'
    `);
  }

  private async createRoute(
    tx: Tx,
    team: Team,
    batch: DispatchWorkOrder[],
    date: string,
  ): Promise<void> {
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

    await tx
      .update(workOrdersTable)
      .set({ team: team.name })
      .where(
        inArray(
          workOrdersTable.id,
          batch.map((wo) => wo.id),
        ),
      );
  }

  private async findDispatchableWorkOrders(): Promise<DispatchWorkOrder[]> {
    const rows = await this.drizzle.db.execute<DispatchWorkOrderRow>(sql`
      SELECT
        wo.id,
        wo.segment_id AS "segmentId",
        rs.road_name AS "roadName",
        wo.priority,
        wo.created_at AS "createdAt",
        rs.km_start AS "kmStart",
        rs.km_end AS "kmEnd"
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
      ...row,
      priority: row.priority as WorkOrderPriority,
      createdAt: new Date(row.createdAt),
      kmStart: Number(row.kmStart),
      kmEnd: Number(row.kmEnd),
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

export function buildGeographicBatches(
  workOrders: DispatchWorkOrder[],
  capacityPerDay: number,
): DispatchWorkOrder[][] {
  const sorted = [...workOrders].sort((a, b) => {
    const priority = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (priority !== 0) return priority;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const used = new Set<string>();
  const batches: DispatchWorkOrder[][] = [];

  for (const seed of sorted) {
    if (used.has(seed.id)) continue;

    const batch: DispatchWorkOrder[] = [seed];
    used.add(seed.id);

    let minKm = seed.kmStart;
    let maxKm = seed.kmEnd;

    for (const candidate of sorted) {
      if (used.has(candidate.id)) continue;
      if (batch.length >= capacityPerDay) break;

      const newMin = Math.min(minKm, candidate.kmStart);
      const newMax = Math.max(maxKm, candidate.kmEnd);

      if (newMax - newMin > MAX_ROUTE_SPAN_KM) continue;

      batch.push(candidate);
      used.add(candidate.id);
      minKm = newMin;
      maxKm = newMax;
    }

    batch.sort((a, b) => a.kmStart - b.kmStart);
    batches.push(batch);
  }

  return batches;
}

export function findResponsibleTeam(
  workOrder: DispatchWorkOrder,
  activeTeams: Team[],
): Team | undefined {
  return activeTeams.find(
    (team) =>
      team.roadName === workOrder.roadName &&
      workOrder.kmStart <= team.kmEnd &&
      workOrder.kmEnd >= team.kmStart,
  );
}

export function dateFromToday(dayOffset: number, today = new Date()): string {
  const date = new Date(today);
  date.setDate(date.getDate() + dayOffset);

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
