import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { WorkOrdersProcessor } from "./work-orders.processor";
import { AlertsModule } from "../alerts/alerts.module";
import { DispatchCronService } from "./dispatch-cron.service";
import { DispatchService } from "./dispatch.service";
import { WorkOrdersService } from "./work-orders.service";
import { WorkOrdersController } from "./work-orders.controller";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { TeamsModule } from "../teams/teams.module";
import { ALERT_EVENTS_QUEUE, SEGMENT_EVENTS_QUEUE } from "../common/queues";
import { WorkOrderPhotosService } from "../work-order-photos/work-order-photos.service";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TeamsModule,
    AlertsModule,
    BullModule.registerQueue({ name: ALERT_EVENTS_QUEUE }),
    BullModule.registerQueue({ name: SEGMENT_EVENTS_QUEUE }),
  ],
  providers: [
    WorkOrdersProcessor,
    DispatchCronService,
    DispatchService,
    WorkOrdersService,
    WorkOrderPhotosService,
  ],
  controllers: [WorkOrdersController],
})
export class WorkOrdersModule {}
