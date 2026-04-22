import { Module } from "@nestjs/common";
import { ProcessKmzUploadUseCase } from "@application/use-cases/process-kmz-upload.use-case";
import { IRoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { DrizzleRoadSegmentRepository } from "@infrastructure/database/repositories/drizzle-road-segment.repository";
import { KmzParserService } from "@infrastructure/geospatial/kmz-parser.service";
import { KmzController } from "@infrastructure/http/kmz.controller";
import { DatabaseModule } from "./database.module";

@Module({
  imports: [DatabaseModule],
  providers: [
    ProcessKmzUploadUseCase,
    KmzParserService,
    {
      provide: IRoadSegmentRepository,
      useClass: DrizzleRoadSegmentRepository,
    },
  ],
  controllers: [KmzController],
})
export class KmzModule {}
