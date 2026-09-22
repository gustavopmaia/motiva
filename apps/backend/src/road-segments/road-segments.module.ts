import { runs } from "../bootstrap/runtime-role";
import { Module } from "@nestjs/common";
import { RoadSegmentsService } from "./road-segments.service";
import { RoadSegmentsController } from "./road-segments.controller";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { TeamsModule } from "../teams/teams.module";

@Module({
  imports: [DatabaseModule, ...(runs("api") ? [AuthModule] : []), TeamsModule],
  providers: [RoadSegmentsService],
  controllers: runs("api") ? [RoadSegmentsController] : [],
})
export class RoadSegmentsModule {}
