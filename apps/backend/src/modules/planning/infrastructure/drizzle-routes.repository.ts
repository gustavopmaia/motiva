import { Database, Transaction } from "../../../platform/persistence/transaction";
import { requestReplanning, requestSegmentReplanning } from "./replanning";
import { randomUUID } from "crypto";
import { sql, SQL } from "drizzle-orm";
import { Route, RouteItem, RouteStatus, RouteActor, RouteFilters } from "../domain/route";
import { RouteRepository } from "../application/routes";
import { InvalidOperationError, NotFoundError } from "../../../common/errors";
import { DrizzleService } from "../../../database/drizzle.service";

type RouteRow = {
  id: string;
  teamId: string;
  teamName: string;
  date: string;
  status: string;
  createdAt: string;
  workOrderId: string | null;
  orderIndex: number | null;
  workOrderStatus: string | null;
  priority: string | null;
  observation: string | null;
  location: string | null;
  segmentId: string | null;
  roadName: string | null;
  direction: string | null;
  kmStart: string | null;
  kmEnd: string | null;
  scoreCurrent: number | null;
  lat: number | null;
  lon: number | null;
};

export class DrizzleRoutesRepository implements RouteRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(filters: RouteFilters, actor: RouteActor): Promise<Route[]> {
    const conditions: SQL[] = this.scope(actor);
    if (filters.teamId) conditions.push(sql`r.team_id = ${filters.teamId}`);
    if (filters.status) conditions.push(sql`r.status = ${filters.status}`);
    if (filters.date) conditions.push(sql`r.date = ${filters.date}`);

    return this.query(conditions);
  }

  async findById(id: string, actor: RouteActor): Promise<Route | null> {
    const [route] = await this.query([sql`r.id = ${id}`, ...this.scope(actor)]);
    return route ?? null;
  }

  async updateStatus(id: string, status: RouteStatus, actor: RouteActor): Promise<Route> {
    return this.drizzle.transaction(async (tx) => {
      await this.lockTeam(tx, id);
      const [existing] = await this.query([sql`r.id = ${id}`], tx);
      if (!existing) throw new NotFoundError("Route not found");
      await tx.execute(sql`UPDATE routes SET status = ${status} WHERE id = ${id}`);
      if (status === "pending_approval") await requestReplanning(tx, [existing.teamId]);
      const updated = { ...existing, status };
      if (existing.status !== status) await this.audit(tx, actor, "status", existing, updated);
      return updated;
    });
  }

  async setItems(id: string, workOrderIds: string[], actor: RouteActor): Promise<Route> {
    return this.drizzle.transaction(async (tx) => {
      await this.lockTeam(tx, id);
      const [existing] = await this.query([sql`r.id = ${id}`], tx);
      if (!existing) throw new NotFoundError("Route not found");
      const affected = [
        ...new Set([...existing.items.map((item) => item.workOrderId), ...workOrderIds]),
      ].sort();
      const previousAssignments = affected.length
        ? await tx.execute<{ team_id: string | null }>(
            sql`SELECT team_id FROM work_orders WHERE id IN (${idList(affected)}) ORDER BY id FOR UPDATE`,
          )
        : [];
      await this.assertAssignable(id, workOrderIds, tx);
      const removed = existing.items
        .map((item) => item.workOrderId)
        .filter((wo) => !workOrderIds.includes(wo));
      await tx.execute(sql`DELETE FROM route_items WHERE route_id = ${id}`);
      for (const [index, workOrderId] of workOrderIds.entries())
        await tx.execute(sql`
        INSERT INTO route_items (id, route_id, work_order_id, order_index) VALUES (${randomUUID()}, ${id}, ${workOrderId}, ${index})
      `);
      if (workOrderIds.length)
        await tx.execute(
          sql`UPDATE work_orders SET team_id = ${existing.teamId} WHERE id IN (${idList(workOrderIds)})`,
        );
      if (removed.length)
        await tx.execute(
          sql`UPDATE work_orders SET team_id = NULL WHERE status = 'open' AND id IN (${idList(removed)})`,
        );
      await tx.execute(sql`UPDATE routes SET status = 'locked' WHERE id = ${id}`);
      await requestReplanning(tx, [
        ...new Set([
          existing.teamId,
          ...previousAssignments.map((row) => row.team_id).filter((id): id is string => !!id),
        ]),
      ]);
      for (const segmentId of [
        ...new Set(
          existing.items
            .filter((item) => removed.includes(item.workOrderId))
            .map((item) => item.segmentId),
        ),
      ].sort())
        await requestSegmentReplanning(tx, segmentId);
      const [updated] = await this.query([sql`r.id = ${id}`], tx);
      await this.audit(tx, actor, "items", existing, updated);
      return updated;
    });
  }

  private scope(actor: RouteActor): SQL[] {
    if (actor.role === "manager" || actor.role === "system") return [];
    return [
      sql`EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = r.team_id AND tm.user_id = ${actor.sub})`,
    ];
  }

  private async audit(
    tx: Transaction,
    actor: RouteActor,
    action: string,
    before: Route,
    after: Route,
  ): Promise<void> {
    const snapshot = (route: Route) => ({
      teamId: route.teamId,
      teamName: route.teamName,
      status: route.status,
      workOrderIds: route.items.map((item) => item.workOrderId),
    });
    await tx.execute(sql`INSERT INTO route_audit (id, route_id, actor_id, actor_role, action, before_state, after_state)
      VALUES (${randomUUID()}, ${before.id}, ${actor.sub}, ${actor.role}, ${action}, ${JSON.stringify(snapshot(before))}::jsonb, ${JSON.stringify(snapshot(after))}::jsonb)`);
  }

  private async lockTeam(tx: Transaction, id: string): Promise<void> {
    const [reference] = await tx.execute<{ team_id: string }>(
      sql`SELECT team_id FROM routes WHERE id = ${id}`,
    );
    if (!reference) throw new NotFoundError("Route not found");
    await tx.execute(sql`SELECT id FROM teams WHERE id = ${reference.team_id} FOR UPDATE`);
    const [route] = await tx.execute(sql`SELECT id FROM routes WHERE id = ${id} FOR UPDATE`);
    if (!route) throw new NotFoundError("Route changed during planning; reload the route");
  }

  private async assertAssignable(
    routeId: string,
    workOrderIds: string[],
    db: Database = this.drizzle.db,
  ): Promise<void> {
    if (!workOrderIds.length) return;

    const rows = await db.execute<{
      id: string;
      status: string;
      routeId: string | null;
    }>(sql`
      SELECT wo.id, wo.status, ri.route_id AS "routeId"
      FROM work_orders wo
      LEFT JOIN route_items ri ON ri.work_order_id = wo.id
      WHERE wo.id IN (${idList(workOrderIds)})
    `);

    const found = new Map(rows.map((row) => [row.id, row]));

    for (const workOrderId of workOrderIds) {
      const row = found.get(workOrderId);
      if (!row) throw new NotFoundError(`Work order ${workOrderId} not found`);

      if (row.status === "completed") {
        throw new InvalidOperationError(`Work order ${workOrderId} is already completed`);
      }

      if (row.routeId && row.routeId !== routeId) {
        throw new InvalidOperationError(
          `Work order ${workOrderId} already belongs to another route`,
        );
      }
    }
  }

  private async query(conditions: SQL[], db: Database = this.drizzle.db): Promise<Route[]> {
    const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    const rows = await db.execute<RouteRow>(sql`
      SELECT
        r.id, r.team_id AS "teamId", t.name AS "teamName", r.date, r.status,
        r.created_at AS "createdAt",
        ri.work_order_id AS "workOrderId", ri.order_index AS "orderIndex",
        wo.status AS "workOrderStatus", wo.priority, wo.observation, wo.location,
        rs.id AS "segmentId", rs.road_name AS "roadName", rs.direction,
        rs.km_start AS "kmStart", rs.km_end AS "kmEnd", rs.score_current AS "scoreCurrent",
        ST_Y(ST_StartPoint(rs.geometry)) AS lat, ST_X(ST_StartPoint(rs.geometry)) AS lon
      FROM routes r
      INNER JOIN teams t ON t.id = r.team_id
      LEFT JOIN route_items ri ON ri.route_id = r.id
      LEFT JOIN work_orders wo ON wo.id = ri.work_order_id
      LEFT JOIN road_segments rs ON rs.id = wo.segment_id
      ${where}
      ORDER BY r.date, r.created_at, ri.order_index
    `);

    const routes = new Map<string, Route>();

    for (const row of rows) {
      let route = routes.get(row.id);
      if (!route) {
        route = {
          id: row.id,
          teamId: row.teamId,
          teamName: row.teamName,
          date: row.date,
          status: row.status as RouteStatus,
          createdAt: new Date(row.createdAt),
          items: [],
        };
        routes.set(row.id, route);
      }

      if (row.workOrderId) route.items.push(toItem(row));
    }

    return [...routes.values()];
  }
}

function toItem(row: RouteRow): RouteItem {
  return {
    workOrderId: row.workOrderId as string,
    orderIndex: Number(row.orderIndex),
    workOrderStatus: row.workOrderStatus as RouteItem["workOrderStatus"],
    priority: row.priority as RouteItem["priority"],
    observation: row.observation,
    location: row.location,
    segmentId: row.segmentId as string,
    roadName: row.roadName as string,
    direction: row.direction,
    kmStart: Number(row.kmStart),
    kmEnd: Number(row.kmEnd),
    scoreCurrent: row.scoreCurrent,
    lat: row.lat,
    lon: row.lon,
  };
}

function idList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
}
