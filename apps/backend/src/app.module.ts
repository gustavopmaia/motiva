import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./auth.module";
import { ReadingsModule } from "./readings.module";
import { AlertsModule } from "./alerts.module";
import { WorkOrdersModule } from "./work-orders.module";
import { RoadSegmentsModule } from "./road-segments.module";
import { HealthController } from "@infrastructure/http/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/backend/.env", ".env"],
    }),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>("REDIS_URL") },
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    ReadingsModule,
    AlertsModule,
    WorkOrdersModule,
    RoadSegmentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
