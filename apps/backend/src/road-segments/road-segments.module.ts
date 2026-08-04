import { Module } from "@nestjs/common";
import { RoadSegmentsService } from "./road-segments.service";
import { RoadSegmentsController } from "./road-segments.controller";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { TeamsModule } from "../teams/teams.module";

@Module({
  imports: [DatabaseModule, AuthModule, TeamsModule],
  providers: [RoadSegmentsService],
  controllers: [RoadSegmentsController],
})
export class RoadSegmentsModule {}
