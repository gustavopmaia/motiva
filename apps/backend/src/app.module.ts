import { OperationContextInterceptor } from "./common/operation-context.interceptor";
import { runs } from "./bootstrap/runtime-role";
import { OutboxPublisher } from "./platform/messaging/outbox-publisher";
import { StorageModule } from "./platform/storage/object-storage";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { BullModule } from "@nestjs/bullmq";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { ApplicationRedis, ApplicationRedisModule } from "./platform/redis/redis.module";
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
import {
  ALERT_EVENTS_QUEUE,
  SEGMENT_EVENTS_QUEUE,
  PHOTO_CLASSIFICATION_QUEUE,
} from "./common/queues";
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
        prefix: config.get<string>("QUEUE_PREFIX") ?? "bull",
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    ...(runs("api") || runs("images") ? [StorageModule] : []),
    BullModule.registerQueue({ name: SEGMENT_EVENTS_QUEUE }),
    BullModule.registerQueue({ name: ALERT_EVENTS_QUEUE }),
    BullModule.registerQueue({ name: PHOTO_CLASSIFICATION_QUEUE }),
    ...(runs("api")
      ? [
          ThrottlerModule.forRootAsync({
            imports: [ApplicationRedisModule],
            inject: [ApplicationRedis],
            useFactory: (redis: ApplicationRedis) => ({
              throttlers: [{ ttl: 60_000, limit: 5 }],
              storage: new RedisThrottlerStorage(redis.client),
            }),
          }),
        ]
      : []),
    ...(runs("api") ? [AuthModule, RoadSegmentsModule, RoutesModule, ReportsModule] : []),
    ...(runs("api") || runs("domain") || runs("mqtt") || runs("images") ? [ReadingsModule] : []),
    ...(runs("api") || runs("domain") ? [AlertsModule, WorkOrdersModule] : []),
    ...(runs("api") || runs("images") ? [VehicleCapturesModule] : []),
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    ...(runs("domain") || runs("images") ? [OutboxPublisher] : []),
    { provide: APP_INTERCEPTOR, useClass: OperationContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
