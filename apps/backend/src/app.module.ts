import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { BullModule, getQueueToken } from "@nestjs/bullmq";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { Queue } from "bullmq";
import { AuthModule } from "./auth/auth.module";
import { ReadingsModule } from "./readings/readings.module";
import { AlertsModule } from "./alerts/alerts.module";
import { WorkOrdersModule } from "./work-orders/work-orders.module";
import { RoadSegmentsModule } from "./road-segments/road-segments.module";
import { RoutesModule } from "./routes/routes.module";
import { VehicleCapturesModule } from "./vehicle-captures/vehicle-captures.module";
import { ReportsModule } from "./reports/reports.module";
import { HealthController } from "./health/health.controller";
import { MetricsController, MetricsInterceptor } from "./metrics/metrics";
import { validateEnv } from "./common/env";
import { DatabaseModule } from "./database/database.module";
import { RedisThrottlerStorage } from "./common/redis-throttler.storage";
import { ALERT_EVENTS_QUEUE, SEGMENT_EVENTS_QUEUE } from "./common/queues";
import { createLoggerConfig } from "./common/logger.config";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/backend/.env", ".env"],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      useFactory: createLoggerConfig,
      inject: [ConfigService],
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
    BullModule.registerQueue({ name: ALERT_EVENTS_QUEUE }),
    ThrottlerModule.forRootAsync({
      imports: [BullModule.registerQueue({ name: SEGMENT_EVENTS_QUEUE })],
      inject: [getQueueToken(SEGMENT_EVENTS_QUEUE)],
      useFactory: (queue: Queue) => ({
        throttlers: [{ ttl: 60_000, limit: 5 }],
        storage: new RedisThrottlerStorage(queue),
      }),
    }),
    AuthModule,
    ReadingsModule,
    AlertsModule,
    WorkOrdersModule,
    RoadSegmentsModule,
    RoutesModule,
    VehicleCapturesModule,
    ReportsModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
})
export class AppModule {}
