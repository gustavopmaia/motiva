import { Module } from "@nestjs/common";
import { ProcessGeoJsonUploadUseCase } from "@application/use-cases/process-geojson-upload.use-case";
import { IRoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { DrizzleRoadSegmentRepository } from "@infrastructure/database/repositories/drizzle-road-segment.repository";
import { GeoJsonParserService } from "@infrastructure/geospatial/geojson-parser.service";
import { GeoJsonController } from "@infrastructure/http/geojson.controller";
import { DatabaseModule } from "./database.module";

@Module({
  imports: [DatabaseModule],
  providers: [
    ProcessGeoJsonUploadUseCase,
    GeoJsonParserService,
    {
      provide: IRoadSegmentRepository,
      useClass: DrizzleRoadSegmentRepository,
    },
  ],
  controllers: [GeoJsonController],
})
export class GeoJsonModule {}
