import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { RiskChangedHandler } from "./application/risk-changed.handler";
import { DrizzleMaintenanceRiskRepository } from "./infrastructure/drizzle-maintenance-risk.repository";
@Module({
  imports: [DatabaseModule],
  providers: [
    DrizzleMaintenanceRiskRepository,
    {
      provide: RiskChangedHandler,
      inject: [DrizzleMaintenanceRiskRepository],
      useFactory: (repository: DrizzleMaintenanceRiskRepository) =>
        new RiskChangedHandler(repository),
    },
  ],
  exports: [RiskChangedHandler],
})
export class MaintenanceModule {}
