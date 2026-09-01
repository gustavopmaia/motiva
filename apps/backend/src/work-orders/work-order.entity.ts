export const WORK_ORDER_STATUSES = ["open", "in_progress", "completed"] as const;
export const WORK_ORDER_PRIORITIES = ["attention", "urgent", "critical"] as const;

export const PATCHABLE_WORK_ORDER_STATUSES = ["open", "in_progress"] as const;

// vocabulario da propria clausula ARTESP (Anexo 06): "local (ex.: canteiro
// central, faixa 1, lateral)" no apontamento diario de servico executado.
export const WORK_ORDER_LOCATIONS = ["canteiro_central", "faixa_1", "faixa_2", "lateral"] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];
export type WorkOrderLocation = (typeof WORK_ORDER_LOCATIONS)[number];

export type WorkOrder = {
  id: string;
  segmentId: string;
  alertId: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  scoreAtCreation: number;
  team: string | null;
  observation: string | null;
  location: WorkOrderLocation | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};
