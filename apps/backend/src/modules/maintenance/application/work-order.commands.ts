import { AuthorizationError, InvalidOperationError } from "../../../common/errors";
import { updateRejection } from "../domain/work-order-policy";
import type {
  WorkOrder,
  WorkOrderActor,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from "../domain/work-order";
import type { WorkOrderCommandsRepository } from "./work-order.ports";
export class WorkOrderCommands {
  constructor(private readonly repository: WorkOrderCommandsRepository) {}
  async create(input: CreateWorkOrderInput, actor: WorkOrderActor): Promise<WorkOrder> {
    if (actor.role !== "manager" && actor.role !== "system")
      throw new AuthorizationError("Only managers can create work orders");
    return this.repository.create(input, actor);
  }
  update(id: string, input: UpdateWorkOrderInput, actor: WorkOrderActor): Promise<WorkOrder> {
    return this.repository.withOrder(id, actor, async (context) => {
      await context.assertAccess();
      if (actor.role === "field" && input.team !== undefined)
        throw new AuthorizationError("Field users cannot reassign work orders");
      const rejected = updateRejection(context.order.status, input.status ?? context.order.status);
      if (rejected) throw new InvalidOperationError(rejected);
      return context.update(input);
    });
  }
  complete(id: string, actor: WorkOrderActor): Promise<WorkOrder> {
    return this.repository.withOrder(id, actor, async (context) => {
      await context.assertAccess();
      if (context.order.status === "completed") return context.order;
      return context.complete();
    });
  }
}
