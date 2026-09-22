import { runs } from "../bootstrap/runtime-role";
import { Module } from "@nestjs/common";
import { RoutesService } from "./routes.service";
import { RoutesController } from "./routes.controller";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { TeamsModule } from "../teams/teams.module";

@Module({
  imports: [DatabaseModule, ...(runs("api") ? [AuthModule] : []), TeamsModule],
  providers: [RoutesService],
  controllers: runs("api") ? [RoutesController] : [],
})
export class RoutesModule {}
