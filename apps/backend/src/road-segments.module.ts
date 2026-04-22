import { Module } from "@nestjs/common";
import { IRoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { RoadSegmentDrizzleRepository } from "@infrastructure/database/repositories/road-segment.drizzle.repository";
import { DatabaseModule } from "./database.module";

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: IRoadSegmentRepository,
      useClass: RoadSegmentDrizzleRepository,
    },
  ],
  exports: [IRoadSegmentRepository],
})
export class RoadSegmentsModule {}
