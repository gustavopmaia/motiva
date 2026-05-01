import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AlertsProcessor } from "@application/processors/alerts.processor";
import { AlertsService } from "@application/services/alerts.service";
import { AlertsController } from "@infrastructure/http/alerts.controller";
import { DatabaseModule } from "./database.module";
import { AuthModule } from "./auth.module";
import { ALERT_EVENTS_QUEUE, SEGMENT_EVENTS_QUEUE } from "@application/jobs/readings-queue.types";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BullModule.registerQueue({ name: SEGMENT_EVENTS_QUEUE }),
    BullModule.registerQueue({ name: ALERT_EVENTS_QUEUE }),
  ],
  providers: [AlertsProcessor, AlertsService],
  controllers: [AlertsController],
})
export class AlertsModule {}
