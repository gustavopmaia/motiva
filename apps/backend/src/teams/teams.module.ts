import { Module } from "@nestjs/common";
import { TeamsService } from "./teams.service";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [DatabaseModule],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
