import { AuthorizationError, InvalidOperationError } from "../../../common/errors";
import { Route, RouteActor, RouteFilters, RouteStatus } from "../domain/route";
export interface RouteRepository {
  findAll(filters: RouteFilters, actor: RouteActor): Promise<Route[]>;
  findById(id: string, actor: RouteActor): Promise<Route | null>;
  updateStatus(id: string, status: RouteStatus, actor: RouteActor): Promise<Route>;
  setItems(id: string, ids: string[], actor: RouteActor): Promise<Route>;
}
export class ManageRoutes {
  constructor(private readonly repository: RouteRepository) {}
  private authorize(actor: RouteActor): void {
    if (actor.role !== "manager" && actor.role !== "system")
      throw new AuthorizationError("Only managers can modify routes");
  }
  findAll(filters: RouteFilters, actor: RouteActor): Promise<Route[]> {
    return this.repository.findAll(filters, actor);
  }
  findById(id: string, actor: RouteActor): Promise<Route | null> {
    return this.repository.findById(id, actor);
  }
  async updateStatus(id: string, status: RouteStatus, actor: RouteActor): Promise<Route> {
    this.authorize(actor);
    if (!["locked", "pending_approval"].includes(status))
      throw new InvalidOperationError("Invalid route status");
    return this.repository.updateStatus(id, status, actor);
  }
  async setItems(id: string, ids: string[], actor: RouteActor): Promise<Route> {
    this.authorize(actor);
    if (new Set(ids).size !== ids.length)
      throw new InvalidOperationError("workOrderIds must not contain duplicates");
    return this.repository.setItems(id, ids, actor);
  }
}
