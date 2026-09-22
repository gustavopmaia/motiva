import { Injectable } from "@nestjs/common";
import { DrizzleService } from "../database/drizzle.service";
import { DrizzleRoadQueries } from "../modules/road-network/infrastructure/drizzle-road.queries";
@Injectable()
export class RoadSegmentsService extends DrizzleRoadQueries {
  constructor(drizzle: DrizzleService) {
    super(drizzle);
  }
}
