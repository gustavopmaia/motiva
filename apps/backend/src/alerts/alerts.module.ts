import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AlertsProcessor } from "./alerts.processor";
import { AlertsService } from "./alerts.service";
import { AlertsController } from "./alerts.controller";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { TeamsModule } from "../teams/teams.module";
import { ALERT_EVENTS_QUEUE, SEGMENT_EVENTS_QUEUE } from "../common/queues";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TeamsModule,
    BullModule.registerQueue({ name: SEGMENT_EVENTS_QUEUE }),
    BullModule.registerQueue({ name: ALERT_EVENTS_QUEUE }),
  ],
  providers: [AlertsProcessor, AlertsService],
  controllers: [AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
