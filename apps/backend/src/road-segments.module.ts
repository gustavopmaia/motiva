import { Module } from "@nestjs/common";
import { RoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { RoadSegmentDrizzleRepository } from "@infrastructure/database/repositories/road-segment.drizzle.repository";
import { RoadSegmentsController } from "@infrastructure/http/road-segments.controller";
import { DatabaseModule } from "./database.module";
import { AuthModule } from "./auth.module";

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [{ provide: RoadSegmentRepository, useClass: RoadSegmentDrizzleRepository }],
  controllers: [RoadSegmentsController],
})
export class RoadSegmentsModule {}
