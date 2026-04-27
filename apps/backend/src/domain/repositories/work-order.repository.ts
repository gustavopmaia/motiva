import { WorkOrder, WorkOrderStatus } from "@domain/entities/work-order.entity";

export type WorkOrderFilters = {
  status?: WorkOrderStatus;
  team?: string;
};

export abstract class WorkOrderRepository {
  abstract save(workOrder: WorkOrder): Promise<WorkOrder>;
  abstract findById(id: string): Promise<WorkOrder | null>;
  abstract findAll(filters: WorkOrderFilters): Promise<WorkOrder[]>;
  abstract update(workOrder: WorkOrder): Promise<WorkOrder>;
}
