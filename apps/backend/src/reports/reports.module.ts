import { runs } from "../bootstrap/runtime-role";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [DatabaseModule, ...(runs("api") ? [AuthModule] : [])],
  providers: [ReportsService],
  controllers: runs("api") ? [ReportsController] : [],
})
export class ReportsModule {}
