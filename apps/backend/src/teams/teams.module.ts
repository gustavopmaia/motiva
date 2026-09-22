import { runs } from "../bootstrap/runtime-role";
import { Module } from "@nestjs/common";
import { TeamsService } from "./teams.service";
import { TeamsController } from "./teams.controller";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [DatabaseModule, ...(runs("api") ? [AuthModule] : [])],
  providers: [TeamsService],
  controllers: runs("api") ? [TeamsController] : [],
  exports: [TeamsService],
})
export class TeamsModule {}
