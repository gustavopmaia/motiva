import { Injectable } from "@nestjs/common";
import { DrizzleService } from "../database/drizzle.service";
import { ManageRoutes } from "../modules/planning/application/routes";
import { DrizzleRoutesRepository } from "../modules/planning/infrastructure/drizzle-routes.repository";
export type { RouteFilters } from "./route.entity";
@Injectable()
export class RoutesService extends ManageRoutes {
  constructor(drizzle: DrizzleService) {
    super(new DrizzleRoutesRepository(drizzle));
  }
}
