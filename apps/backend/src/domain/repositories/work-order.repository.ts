import { WorkOrder, WorkOrderStatus } from "@domain/entities/work-order.entity";

export type WorkOrderFilters = {
  status?: WorkOrderStatus;
  team?: string;
};

export const WorkOrderRepository = Symbol("WorkOrderRepository");

export interface WorkOrderRepository {
  save(workOrder: WorkOrder): Promise<WorkOrder>;
  findById(id: string): Promise<WorkOrder | null>;
  findAll(filters: WorkOrderFilters): Promise<WorkOrder[]>;
  update(workOrder: WorkOrder): Promise<WorkOrder>;
}
