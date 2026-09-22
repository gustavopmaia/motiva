import type {
  WorkOrder,
  WorkOrderActor,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from "../domain/work-order";
export type WorkOrderContext = {
  order: WorkOrder;
  assertAccess(): Promise<void>;
  update(input: UpdateWorkOrderInput): Promise<WorkOrder>;
  complete(): Promise<WorkOrder>;
};
export interface WorkOrderCommandsRepository {
  create(input: CreateWorkOrderInput, actor: WorkOrderActor): Promise<WorkOrder>;
  withOrder(
    id: string,
    actor: WorkOrderActor,
    action: (context: WorkOrderContext) => Promise<WorkOrder>,
  ): Promise<WorkOrder>;
}
