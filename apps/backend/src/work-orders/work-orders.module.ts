import { runs } from "../bootstrap/runtime-role";
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
    ...(runs("api") ? [AuthModule] : []),
    TeamsModule,
    AlertsModule,
    BullModule.registerQueue({ name: ALERT_EVENTS_QUEUE }),
    BullModule.registerQueue({ name: SEGMENT_EVENTS_QUEUE }),
  ],
  providers: [
    ...(runs("domain") ? [WorkOrdersProcessor, DispatchCronService] : []),
    DispatchService,
    WorkOrdersService,
    ...(runs("api") ? [WorkOrderPhotosService] : []),
  ],
  controllers: runs("api") ? [WorkOrdersController] : [],
})
export class WorkOrdersModule {}
