import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { sql, SQL } from "drizzle-orm";
import { Route, RouteItem, RouteStatus } from "./route.entity";
import { WorkOrderPriority, WorkOrderStatus } from "../work-orders/work-order.entity";
import { InvalidOperationError, NotFoundError } from "../common/errors";
import { DrizzleService } from "../database/drizzle.service";

export type RouteFilters = {
  teamId?: string;
  status?: RouteStatus;
  date?: string;
};

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
  segmentId: string | null;
  roadName: string | null;
  kmStart: string | null;
  kmEnd: string | null;
  scoreCurrent: number | null;
  lat: number | null;
  lon: number | null;
};

@Injectable()
export class RoutesService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(filters: RouteFilters): Promise<Route[]> {
    const conditions: SQL[] = [];
    if (filters.teamId) conditions.push(sql`r.team_id = ${filters.teamId}`);
    if (filters.status) conditions.push(sql`r.status = ${filters.status}`);
    if (filters.date) conditions.push(sql`r.date = ${filters.date}`);

    return this.query(conditions);
  }

  async findById(id: string): Promise<Route | null> {
    const [route] = await this.query([sql`r.id = ${id}`]);
    return route ?? null;
  }

  async updateStatus(id: string, status: RouteStatus): Promise<Route> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError("Route not found");

    await this.drizzle.db.execute(sql`UPDATE routes SET status = ${status} WHERE id = ${id}`);

    return { ...existing, status };
  }

  /**
   * Reorders the work orders of a route. The route is locked so the dispatch cron
   * stops replanning it — an unlocked route is dropped and rebuilt on the next run,
   * which would silently discard the manual ordering.
   */
  async reorder(id: string, workOrderIds: string[]): Promise<Route> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError("Route not found");

    const current = existing.items.map((item) => item.workOrderId);
    if (!sameSet(current, workOrderIds)) {
      throw new InvalidOperationError(
        "workOrderIds must contain exactly the work orders currently in the route",
      );
    }

    await this.drizzle.db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM route_items WHERE route_id = ${id}`);

      for (const [orderIndex, workOrderId] of workOrderIds.entries()) {
        await tx.execute(sql`
          INSERT INTO route_items (id, route_id, work_order_id, order_index)
          VALUES (${randomUUID()}, ${id}, ${workOrderId}, ${orderIndex})
        `);
      }

      await tx.execute(sql`UPDATE routes SET status = 'locked' WHERE id = ${id}`);
    });

    const byWorkOrder = new Map(existing.items.map((item) => [item.workOrderId, item]));

    return {
      ...existing,
      status: "locked",
      items: workOrderIds.map((workOrderId, orderIndex) => ({
        ...(byWorkOrder.get(workOrderId) as RouteItem),
        orderIndex,
      })),
    };
  }

  private async query(conditions: SQL[]): Promise<Route[]> {
    const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    const rows = await this.drizzle.db.execute<RouteRow>(sql`
      SELECT
        r.id, r.team_id AS "teamId", t.name AS "teamName", r.date, r.status,
        r.created_at AS "createdAt",
        ri.work_order_id AS "workOrderId", ri.order_index AS "orderIndex",
        wo.status AS "workOrderStatus", wo.priority, wo.observation,
        rs.id AS "segmentId", rs.road_name AS "roadName",
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
    workOrderStatus: row.workOrderStatus as WorkOrderStatus,
    priority: row.priority as WorkOrderPriority,
    observation: row.observation,
    segmentId: row.segmentId as string,
    roadName: row.roadName as string,
    kmStart: Number(row.kmStart),
    kmEnd: Number(row.kmEnd),
    scoreCurrent: row.scoreCurrent,
    lat: row.lat,
    lon: row.lon,
  };
}

function sameSet(current: string[], incoming: string[]): boolean {
  if (current.length !== incoming.length) return false;

  const unique = new Set(incoming);
  if (unique.size !== incoming.length) return false;

  return current.every((id) => unique.has(id));
}
