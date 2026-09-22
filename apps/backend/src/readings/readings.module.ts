import { RiskExpiryScheduler } from "./risk-expiry.scheduler";
import { runs } from "../bootstrap/runtime-role";
import { SegmentLocator } from "../road-segments/segment-locator";
import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { FusionService } from "./fusion.service";
import { ReadingsService } from "./readings.service";
import { ReadingsController } from "./readings.controller";
import { ReadingsMqttHandler } from "./readings-mqtt.handler";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { SEGMENT_EVENTS_QUEUE } from "../common/queues";

@Module({
  imports: [
    DatabaseModule,
    ...(runs("api") ? [AuthModule] : []),
    BullModule.registerQueue({ name: SEGMENT_EVENTS_QUEUE }),
  ],
  providers: [
    SegmentLocator,
    FusionService,
    ReadingsService,
    ...(runs("mqtt") ? [ReadingsMqttHandler] : []),
    ...(runs("domain") ? [RiskExpiryScheduler] : []),
  ],
  controllers: runs("api") ? [ReadingsController] : [],
  exports: [ReadingsService, ...(runs("mqtt") ? [ReadingsMqttHandler] : [])],
})
export class ReadingsModule {}
