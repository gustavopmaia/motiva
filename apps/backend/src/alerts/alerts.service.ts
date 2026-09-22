import { Injectable } from "@nestjs/common";
import { DrizzleService } from "../database/drizzle.service";
import { DrizzleAlertsRepository } from "../modules/maintenance/infrastructure/drizzle-alerts.repository";
@Injectable()
export class AlertsService extends DrizzleAlertsRepository {
  constructor(drizzle: DrizzleService) {
    super(drizzle);
  }
}
