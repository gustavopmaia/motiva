export type RouteStatus = "pending_approval" | "approved" | "locked";

export type Route = {
  id: string;
  teamId: string;
  date: string;
  status: RouteStatus;
  createdAt: Date;
};

export type RouteItem = {
  id: string;
  routeId: string;
  workOrderId: string;
  orderIndex: number;
  createdAt: Date;
};
