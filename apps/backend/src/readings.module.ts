import { Module } from "@nestjs/common";
import { FusionService } from "@application/services/fusion.service";
import { CreateReadingUseCase } from "@application/use-cases/create-reading.use-case";
import { ReadingRepository } from "@domain/repositories/reading.repository";
import { RoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { ReadingDrizzleRepository } from "@infrastructure/database/repositories/reading.drizzle.repository";
import { ReadingsController } from "@infrastructure/http/readings.controller";
import { ReadingsMqttHandler } from "@infrastructure/mqtt/readings.mqtt.handler";
import { DatabaseModule } from "./database.module";
import { RoadSegmentsModule } from "./road-segments.module";
import { AuthModule } from "./auth.module";

@Module({
  imports: [DatabaseModule, RoadSegmentsModule, AuthModule],
  providers: [
    FusionService,
    ReadingsMqttHandler,
    { provide: ReadingRepository, useClass: ReadingDrizzleRepository },
    {
      provide: CreateReadingUseCase,
      useFactory: (
        roadSegmentRepository: RoadSegmentRepository,
        readingRepository: ReadingRepository,
        fusionService: FusionService,
      ) => new CreateReadingUseCase(roadSegmentRepository, readingRepository, fusionService),
      inject: [RoadSegmentRepository, ReadingRepository, FusionService],
    },
  ],
  controllers: [ReadingsController],
})
export class ReadingsModule {}
