import { Injectable } from "@nestjs/common";
import { DrizzleService } from "../database/drizzle.service";
import { DispatchPlanner } from "../modules/planning/application/dispatch-planner";
import { DrizzleDispatchRepository } from "../modules/planning/infrastructure/drizzle-dispatch.repository";
export {
  buildGeographicBatches,
  findResponsibleTeam,
  dateFromToday,
} from "../modules/planning/domain/dispatch-policy";
export type { DispatchWorkOrder } from "../modules/planning/domain/dispatch-policy";
@Injectable()
export class DispatchService {
  private readonly planner: DispatchPlanner;
  constructor(drizzle: DrizzleService) {
    this.planner = new DispatchPlanner(new DrizzleDispatchRepository(drizzle));
  }
  runDispatch(onlyRequested = false): Promise<void> {
    return this.planner.execute(onlyRequested);
  }
}
