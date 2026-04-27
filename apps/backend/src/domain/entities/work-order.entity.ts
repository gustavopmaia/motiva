export type WorkOrderStatus = "open" | "in_progress" | "completed";
export type WorkOrderPriority = "normal" | "urgent" | "critical";

export class WorkOrder {
  constructor(
    public readonly id: string,
    public readonly segmentId: string,
    public readonly alertId: string,
    public readonly status: WorkOrderStatus,
    public readonly priority: WorkOrderPriority,
    public readonly scoreAtCreation: number,
    public readonly team: string | null,
    public readonly observation: string | null,
    public readonly createdAt: Date = new Date(),
    public readonly startedAt: Date | null = null,
    public readonly completedAt: Date | null = null,
  ) {}
}
