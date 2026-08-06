import { WorkOrderPriority, WorkOrderStatus } from "../work-orders/work-order.entity";

export const ROUTE_STATUSES = ["pending_approval", "locked"] as const;

export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export type RouteItem = {
  workOrderId: string;
  orderIndex: number;
  workOrderStatus: WorkOrderStatus;
  priority: WorkOrderPriority;
  observation: string | null;
  segmentId: string;
  roadName: string;
  kmStart: number;
  kmEnd: number;
  scoreCurrent: number | null;
};

export type Route = {
  id: string;
  teamId: string;
  teamName: string;
  date: string;
  status: RouteStatus;
  createdAt: Date;
  items: RouteItem[];
};
