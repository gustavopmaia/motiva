import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { FusionService } from "@application/services/fusion.service";
import { ReadingsService } from "@application/services/readings.service";
import { ReadingsController } from "@infrastructure/http/readings.controller";
import { ReadingsMqttHandler } from "@infrastructure/mqtt/readings.mqtt.handler";
import { DatabaseModule } from "./database.module";
import { AuthModule } from "./auth.module";
import { READINGS_QUEUE } from "@application/jobs/readings-queue.types";

@Module({
  imports: [DatabaseModule, AuthModule, BullModule.registerQueue({ name: READINGS_QUEUE })],
  providers: [FusionService, ReadingsService, ReadingsMqttHandler],
  controllers: [ReadingsController],
})
export class ReadingsModule {}
