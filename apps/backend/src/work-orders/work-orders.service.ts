import { Injectable } from "@nestjs/common";
import { DrizzleService } from "../database/drizzle.service";
import { Transaction } from "../platform/persistence/transaction";
import { DrizzleWorkOrdersRepository } from "../modules/maintenance/infrastructure/drizzle-work-orders.repository";
import { WorkOrderCommands } from "../modules/maintenance/application/work-order.commands";
import {
  WorkOrder,
  WorkOrderActor,
  WorkOrderFilters,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from "../modules/maintenance/domain/work-order";
export { SYSTEM_ACTOR } from "../modules/maintenance/domain/work-order";
export type {
  WorkOrderActor,
  WorkOrderFilters,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from "../modules/maintenance/domain/work-order";
@Injectable()
export class WorkOrdersService {
  private readonly repository: DrizzleWorkOrdersRepository;
  constructor(private readonly drizzle: DrizzleService) {
    this.repository = new DrizzleWorkOrdersRepository(drizzle);
  }
  private commands(tx?: Transaction): WorkOrderCommands {
    return new WorkOrderCommands(new DrizzleWorkOrdersRepository(this.drizzle, tx));
  }
  findAll(filters: WorkOrderFilters, actor: WorkOrderActor): Promise<WorkOrder[]> {
    return this.repository.findAll(filters, actor);
  }
  findById(id: string): Promise<WorkOrder | null> {
    return this.repository.findById(id);
  }
  create(input: CreateWorkOrderInput, actor: WorkOrderActor, tx?: Transaction): Promise<WorkOrder> {
    return this.commands(tx).create(input, actor);
  }
  update(id: string, input: UpdateWorkOrderInput, actor: WorkOrderActor): Promise<WorkOrder> {
    return this.commands().update(id, input, actor);
  }
  complete(id: string, actor: WorkOrderActor, tx?: Transaction): Promise<WorkOrder> {
    return this.commands(tx).complete(id, actor);
  }
  lockOrder(tx: Transaction, id: string): Promise<WorkOrder> {
    return this.repository.lockOrder(tx, id);
  }
  assertAccess(tx: Transaction, actor: WorkOrderActor, order: WorkOrder): Promise<void> {
    return this.repository.assertAccess(tx, actor, order);
  }
}
