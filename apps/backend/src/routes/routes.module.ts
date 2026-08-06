import { Module } from "@nestjs/common";
import { RoutesService } from "./routes.service";
import { RoutesController } from "./routes.controller";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { TeamsModule } from "../teams/teams.module";

@Module({
  imports: [DatabaseModule, AuthModule, TeamsModule],
  providers: [RoutesService],
  controllers: [RoutesController],
})
export class RoutesModule {}
