import { Module } from "@nestjs/common";
import { FusionService } from "@application/services/fusion.service";
import { CreateReadingUseCase } from "@application/use-cases/create-reading.use-case";
import { IReadingRepository } from "@domain/repositories/reading.repository";
import { ReadingDrizzleRepository } from "@infrastructure/database/repositories/reading.drizzle.repository";
import { ApiKeyGuard } from "@infrastructure/http/guards/api-key.guard";
import { ReadingsController } from "@infrastructure/http/readings.controller";
import { ReadingsMqttHandler } from "@infrastructure/mqtt/readings.mqtt.handler";
import { DatabaseModule } from "./database.module";
import { RoadSegmentsModule } from "./road-segments.module";

@Module({
  imports: [DatabaseModule, RoadSegmentsModule],
  providers: [
    ApiKeyGuard,
    CreateReadingUseCase,
    FusionService,
    ReadingsMqttHandler,
    {
      provide: IReadingRepository,
      useClass: ReadingDrizzleRepository,
    },
  ],
  controllers: [ReadingsController],
})
export class ReadingsModule {}
