import { Injectable } from "@nestjs/common";
import { DrizzleService } from "../database/drizzle.service";
import { DrizzleTeamsQueries } from "../modules/teams/infrastructure/drizzle-teams.queries";
export type { DataScope, TeamBase } from "../modules/teams/infrastructure/drizzle-teams.queries";
@Injectable()
export class TeamsService extends DrizzleTeamsQueries {
  constructor(drizzle: DrizzleService) {
    super(drizzle);
  }
}
