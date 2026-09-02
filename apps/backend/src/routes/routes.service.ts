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

  async setItems(id: string, workOrderIds: string[]): Promise<Route> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError("Route not found");

    if (new Set(workOrderIds).size !== workOrderIds.length) {
      throw new InvalidOperationError("workOrderIds must not contain duplicates");
    }

    await this.assertAssignable(id, workOrderIds);

    const removed = existing.items
      .map((item) => item.workOrderId)
      .filter((workOrderId) => !workOrderIds.includes(workOrderId));

    await this.drizzle.db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM route_items WHERE route_id = ${id}`);

      for (const [orderIndex, workOrderId] of workOrderIds.entries()) {
        await tx.execute(sql`
          INSERT INTO route_items (id, route_id, work_order_id, order_index)
          VALUES (${randomUUID()}, ${id}, ${workOrderId}, ${orderIndex})
        `);
      }

      if (workOrderIds.length) {
        await tx.execute(sql`
          UPDATE work_orders SET team = ${existing.teamName}
          WHERE id IN (${idList(workOrderIds)})
        `);
      }

      if (removed.length) {
        await tx.execute(sql`
          UPDATE work_orders SET team = NULL WHERE id IN (${idList(removed)})
        `);
      }

      await tx.execute(sql`UPDATE routes SET status = 'locked' WHERE id = ${id}`);
    });

    return (await this.findById(id)) as Route;
  }

  private async assertAssignable(routeId: string, workOrderIds: string[]): Promise<void> {
    if (!workOrderIds.length) return;

    const rows = await this.drizzle.db.execute<{
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

  private async query(conditions: SQL[]): Promise<Route[]> {
    const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    const rows = await this.drizzle.db.execute<RouteRow>(sql`
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
    workOrderStatus: row.workOrderStatus as WorkOrderStatus,
    priority: row.priority as WorkOrderPriority,
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
