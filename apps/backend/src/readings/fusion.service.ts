import { Injectable } from "@nestjs/common";
import { DrizzleService } from "../database/drizzle.service";
import { DrizzleRiskFusion } from "../modules/monitoring/infrastructure/drizzle-risk-fusion";
@Injectable()
export class FusionService extends DrizzleRiskFusion {
  constructor(drizzle: DrizzleService) {
    super(drizzle);
  }
}
