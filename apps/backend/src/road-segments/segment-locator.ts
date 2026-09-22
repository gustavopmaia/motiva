import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DrizzleService } from "../database/drizzle.service";
import { DrizzleSegmentLocator } from "../modules/road-network/infrastructure/drizzle-segment-locator";
@Injectable()
export class SegmentLocator extends DrizzleSegmentLocator {
  constructor(drizzle: DrizzleService, config: ConfigService) {
    super(drizzle, Number(config.get<number>("SEGMENT_MATCH_RADIUS_M") ?? 500));
  }
}
