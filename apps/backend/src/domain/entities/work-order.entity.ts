export type WorkOrderStatus = "open" | "in_progress" | "completed";
export type WorkOrderPriority = "normal" | "urgent" | "critical";

export type WorkOrder = {
  id: string;
  segmentId: string;
  alertId: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  scoreAtCreation: number;
  team: string | null;
  observation: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};
