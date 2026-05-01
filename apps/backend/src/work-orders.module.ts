import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { WorkOrdersProcessor } from "@application/processors/work-orders.processor";
import { AlertsService } from "@application/services/alerts.service";
import { DispatchCronService } from "@application/services/dispatch-cron.service";
import { DispatchService } from "@application/services/dispatch.service";
import { WorkOrdersService } from "@application/services/work-orders.service";
import { WorkOrdersController } from "@infrastructure/http/work-orders.controller";
import { DatabaseModule } from "./database.module";
import { AuthModule } from "./auth.module";
import { ALERT_EVENTS_QUEUE } from "@application/jobs/readings-queue.types";

@Module({
  imports: [DatabaseModule, AuthModule, BullModule.registerQueue({ name: ALERT_EVENTS_QUEUE })],
  providers: [
    WorkOrdersProcessor,
    AlertsService,
    DispatchCronService,
    DispatchService,
    WorkOrdersService,
  ],
  controllers: [WorkOrdersController],
})
export class WorkOrdersModule {}
