import { Module } from "@nestjs/common";
import { AlertsListener } from "@application/listeners/alerts.listener";
import { AlertRepository } from "@domain/repositories/alert.repository";
import { AlertDrizzleRepository } from "@infrastructure/database/repositories/alert.drizzle.repository";
import { AlertsController } from "@infrastructure/http/alerts.controller";
import { DatabaseModule } from "./database.module";
import { AuthModule } from "./auth.module";

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [AlertsListener, { provide: AlertRepository, useClass: AlertDrizzleRepository }],
  controllers: [AlertsController],
})
export class AlertsModule {}
