import { Module } from "@nestjs/common";
import { IRoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { DrizzleRoadSegmentRepository } from "@infrastructure/database/repositories/drizzle.road-segment.repository";
import { DatabaseModule } from "./database.module";

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: IRoadSegmentRepository,
      useClass: DrizzleRoadSegmentRepository,
    },
  ],
  exports: [IRoadSegmentRepository],
})
export class RoadSegmentsModule {}
