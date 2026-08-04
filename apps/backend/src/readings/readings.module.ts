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
  imports: [DatabaseModule, AuthModule, BullModule.registerQueue({ name: SEGMENT_EVENTS_QUEUE })],
  providers: [FusionService, ReadingsService, ReadingsMqttHandler],
  controllers: [ReadingsController],
})
export class ReadingsModule {}
