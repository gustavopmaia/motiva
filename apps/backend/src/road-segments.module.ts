import { Module } from "@nestjs/common";
import { RoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { RoadSegmentDrizzleRepository } from "@infrastructure/database/repositories/road-segment.drizzle.repository";
import { DatabaseModule } from "./database.module";

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: RoadSegmentRepository,
      useClass: RoadSegmentDrizzleRepository,
    },
  ],
  exports: [RoadSegmentRepository],
})
export class RoadSegmentsModule {}
