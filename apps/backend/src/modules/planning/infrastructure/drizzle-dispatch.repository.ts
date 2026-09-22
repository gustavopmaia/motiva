import { asc, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { DrizzleService } from "../../../database/drizzle.service";
import { routeItems, routes, teams, workOrders as workOrdersTable } from "../../../database/schema";
import { Database, Transaction as Tx } from "../../../platform/persistence/transaction";
import {
  Team,
  WorkOrderPriority,
  DispatchWorkOrder,
  dateFromToday,
  findResponsibleTeam,
} from "../domain/dispatch-policy";
import { DispatchRepository, PlanningSnapshot } from "../application/dispatch.ports";
import { requestReplanning } from "./replanning";
type DispatchWorkOrderRow = Omit<
  DispatchWorkOrder,
  "kmStart" | "kmEnd" | "priority" | "createdAt"
> & { priority: string; createdAt: string; kmStart: string; kmEnd: string };
export class DrizzleDispatchRepository implements DispatchRepository {
  constructor(private readonly drizzle: DrizzleService) {}
  async teamIds(): Promise<string[]> {
    return (await this.findTeams()).map((team) => team.id);
  }
  async snapshot(
    teamId: string,
    onlyRequested: boolean,
    db: Database = this.drizzle.db,
    lock = false,
  ): Promise<PlanningSnapshot | null> {
    const allTeams = await this.findTeams(db);
    const active = allTeams.filter((team) => team.active && team.capacityPerDay > 0);
    const team = allTeams.find((team) => team.id === teamId);
    if (!team || (await this.findBusyTeamIds(db)).has(teamId)) return null;
    const candidates = await this.findDispatchableWorkOrders(db, team, lock);
    const [request] = await db.execute<{ requested_version: string; completed_version: string }>(
      sql`SELECT requested_version, completed_version FROM dispatch_requests WHERE team_id = ${teamId} ${lock ? sql`FOR UPDATE` : sql``}`,
    );
    if (onlyRequested && (!request || request.requested_version === request.completed_version))
      return null;
    const owned = await db.execute<{ id: string; status: string; items: string[] }>(sql`
      SELECT r.id, r.status, COALESCE(array_agg(ri.work_order_id::text ORDER BY ri.order_index) FILTER (WHERE ri.id IS NOT NULL), ARRAY[]::text[]) AS items
      FROM routes r LEFT JOIN route_items ri ON ri.route_id = r.id WHERE r.team_id = ${teamId}
      GROUP BY r.id ORDER BY r.id
    `);
    return {
      team,
      teams: active,
      candidates,
      routes: [...owned],
      requestedVersion: request?.requested_version ?? null,
    };
  }
  async apply(
    snapshot: PlanningSnapshot,
    batches: DispatchWorkOrder[][],
  ): Promise<"applied" | "stale" | "busy"> {
    return this.drizzle.transaction(async (tx) => {
      const teamId = snapshot.team.id;
      const [locked] = await tx.execute(
        sql`SELECT id FROM teams WHERE id = ${teamId} FOR UPDATE SKIP LOCKED`,
      );
      if (!locked) return "busy";
      // Lock current route items in the same order as manual editing before revalidation.
      await tx.execute(sql`SELECT wo.id FROM work_orders wo JOIN route_items ri ON ri.work_order_id = wo.id
        JOIN routes r ON r.id = ri.route_id WHERE r.team_id = ${teamId} ORDER BY wo.id FOR UPDATE OF wo`);
      const current = await this.snapshot(teamId, false, tx, true);
      if (!current || JSON.stringify(current) !== JSON.stringify(snapshot)) return "stale";
      const released = await this.clearOpenRoutes(tx, teamId);
      for (const [offset, batch] of batches.entries())
        await this.createRoute(tx, current.team, batch, dateFromToday(offset));
      const plannedIds = new Set(batches.flat().map((order) => order.id));
      const transferred = released.filter((id) => !plannedIds.has(id));
      if (transferred.length) {
        const rows = await tx.execute<{ roadName: string; kmStart: string; kmEnd: string }>(sql`
          SELECT rs.road_name AS "roadName", rs.km_start AS "kmStart", rs.km_end AS "kmEnd"
          FROM work_orders wo JOIN road_segments rs ON rs.id = wo.segment_id
          WHERE wo.id IN (${sql.join(
            transferred.map((id) => sql`${id}`),
            sql`, `,
          )})
        `);
        const owners = rows
          .map(
            (row) =>
              findResponsibleTeam(
                { roadName: row.roadName, kmStart: Number(row.kmStart), kmEnd: Number(row.kmEnd) },
                current.teams,
              )?.id,
          )
          .filter((id): id is string => !!id && id !== teamId);
        await requestReplanning(tx, [...new Set(owners)]);
      }
      if (snapshot.requestedVersion)
        await tx.execute(
          sql`UPDATE dispatch_requests SET completed_version = ${snapshot.requestedVersion}::bigint WHERE team_id = ${teamId}`,
        );
      return "applied";
    });
  }
  private async clearOpenRoutes(tx: Tx, teamId: string): Promise<string[]> {
    const released = await tx.execute<{ id: string }>(sql`
      UPDATE work_orders
      SET team_id = NULL
      WHERE status = 'open' AND id IN (
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
      RETURNING id
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
    return released.map((row) => row.id);
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
      .set({ teamId: team.id })
      .where(
        inArray(
          workOrdersTable.id,
          batch.map((wo) => wo.id),
        ),
      );
  }

  private async findDispatchableWorkOrders(
    db: Database = this.drizzle.db,
    team?: Team,
    lock = false,
  ): Promise<DispatchWorkOrder[]> {
    const rows = await db.execute<DispatchWorkOrderRow>(sql`
      SELECT
        wo.id,
        wo.segment_id AS "segmentId",
        rs.road_name AS "roadName",
        wo.priority,
        wo.created_at AS "createdAt",
        rs.km_start AS "kmStart",
        rs.km_end AS "kmEnd",
        ST_Y(ST_StartPoint(rs.geometry)) AS lat,
        ST_X(ST_StartPoint(rs.geometry)) AS lon
      FROM work_orders wo
      INNER JOIN road_segments rs ON rs.id = wo.segment_id
      WHERE wo.status = 'open'
        ${team ? sql`AND rs.road_name = ${team.roadName} AND rs.km_start <= ${team.kmEnd} AND rs.km_end >= ${team.kmStart}` : sql``}
        AND NOT EXISTS (
          SELECT 1
          FROM route_items ri
          INNER JOIN routes r ON r.id = ri.route_id
          WHERE ri.work_order_id = wo.id
            AND r.status = 'locked'
        )
        ${
          team
            ? sql`AND NOT EXISTS (
          SELECT 1 FROM route_items owned JOIN routes owner ON owner.id = owned.route_id
          WHERE owned.work_order_id = wo.id AND owner.team_id <> ${team.id}
        )`
            : sql``
        }
      ORDER BY wo.id
      ${lock ? sql`FOR UPDATE OF wo` : sql``}
    `);

    return rows.map((row) => ({
      ...row,
      priority: row.priority as WorkOrderPriority,
      createdAt: new Date(row.createdAt),
      kmStart: Number(row.kmStart),
      kmEnd: Number(row.kmEnd),
    }));
  }

  private async findBusyTeamIds(db: Database = this.drizzle.db): Promise<Set<string>> {
    const rows = await db.execute<{ team_id: string }>(sql`
      SELECT DISTINCT team_id
      FROM work_orders
      WHERE status = 'in_progress' AND team_id IS NOT NULL
    `);
    return new Set(rows.map((r) => r.team_id));
  }

  private async findTeams(db: Database = this.drizzle.db): Promise<Team[]> {
    const rows = await db.select().from(teams).orderBy(asc(teams.name), asc(teams.id));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      baseLat: row.baseLat,
      baseLng: row.baseLng,
      roadName: row.roadName,
      kmStart: Number(row.kmStart),
      kmEnd: Number(row.kmEnd),
      capacityPerDay: row.capacityPerDay,
      active: row.active,
    }));
  }
}
