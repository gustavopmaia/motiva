import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AlertsProcessor } from "@application/processors/alerts.processor";
import { AlertsService } from "@application/services/alerts.service";
import { AlertsController } from "@infrastructure/http/alerts.controller";
import { DatabaseModule } from "./database.module";
import { AuthModule } from "./auth.module";
import { ALERTS_QUEUE, READINGS_QUEUE } from "@application/jobs/readings-queue.types";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BullModule.registerQueue({ name: READINGS_QUEUE }),
    BullModule.registerQueue({ name: ALERTS_QUEUE }),
  ],
  providers: [AlertsProcessor, AlertsService],
  controllers: [AlertsController],
})
export class AlertsModule {}
