import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./auth/auth.module";
import { ReadingsModule } from "./readings/readings.module";
import { AlertsModule } from "./alerts/alerts.module";
import { WorkOrdersModule } from "./work-orders/work-orders.module";
import { RoadSegmentsModule } from "./road-segments/road-segments.module";
import { HealthController } from "./health/health.controller";
import { validateEnv } from "./common/env";
import { DatabaseModule } from "./database/database.module";
import { SEGMENT_EVENTS_QUEUE } from "./common/queues";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/backend/.env", ".env"],
      validate: validateEnv,
    }),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>("REDIS_URL") },
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    BullModule.registerQueue({ name: SEGMENT_EVENTS_QUEUE }),
    AuthModule,
    ReadingsModule,
    AlertsModule,
    WorkOrdersModule,
    RoadSegmentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
