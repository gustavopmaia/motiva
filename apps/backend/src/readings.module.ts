import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { FusionService } from "@application/services/fusion.service";
import { CreateReadingUseCase } from "@application/use-cases/create-reading.use-case";
import { ReadingRepository } from "@domain/repositories/reading.repository";
import { RoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { ReadingDrizzleRepository } from "@infrastructure/database/repositories/reading.drizzle.repository";
import { RoadSegmentDrizzleRepository } from "@infrastructure/database/repositories/road-segment.drizzle.repository";
import { ReadingsController } from "@infrastructure/http/readings.controller";
import { ReadingsMqttHandler } from "@infrastructure/mqtt/readings.mqtt.handler";
import { DatabaseModule } from "./database.module";
import { AuthModule } from "./auth.module";
import { READINGS_QUEUE } from "@application/jobs/readings-queue.types";

@Module({
  imports: [DatabaseModule, AuthModule, BullModule.registerQueue({ name: READINGS_QUEUE })],
  providers: [
    FusionService,
    ReadingsMqttHandler,
    { provide: ReadingRepository, useClass: ReadingDrizzleRepository },
    { provide: RoadSegmentRepository, useClass: RoadSegmentDrizzleRepository },
    CreateReadingUseCase,
  ],
  controllers: [ReadingsController],
})
export class ReadingsModule {}
