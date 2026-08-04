export const WORK_ORDER_STATUSES = ["open", "in_progress", "completed"] as const;
export const WORK_ORDER_PRIORITIES = ["attention", "urgent", "critical"] as const;

export const PATCHABLE_WORK_ORDER_STATUSES = ["open", "in_progress"] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

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
