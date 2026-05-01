import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { WorkOrdersProcessor } from "@application/processors/work-orders.processor";
import { AlertsService } from "@application/services/alerts.service";
import { WorkOrdersService } from "@application/services/work-orders.service";
import { WorkOrdersController } from "@infrastructure/http/work-orders.controller";
import { DatabaseModule } from "./database.module";
import { AuthModule } from "./auth.module";
import { ALERTS_QUEUE } from "@application/jobs/readings-queue.types";

@Module({
  imports: [DatabaseModule, AuthModule, BullModule.registerQueue({ name: ALERTS_QUEUE })],
  providers: [WorkOrdersProcessor, AlertsService, WorkOrdersService],
  controllers: [WorkOrdersController],
})
export class WorkOrdersModule {}
