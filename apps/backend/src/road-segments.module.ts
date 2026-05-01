import { Module } from "@nestjs/common";
import { RoadSegmentsService } from "@application/services/road-segments.service";
import { RoadSegmentsController } from "@infrastructure/http/road-segments.controller";
import { DatabaseModule } from "./database.module";
import { AuthModule } from "./auth.module";

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [RoadSegmentsService],
  controllers: [RoadSegmentsController],
})
export class RoadSegmentsModule {}
