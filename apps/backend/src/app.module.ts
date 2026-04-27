import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { AuthModule } from "./auth.module";
import { RoadSegmentsModule } from "./road-segments.module";
import { ReadingsModule } from "./readings.module";
import { AlertsModule } from "./alerts.module";
import { WorkOrdersModule } from "./work-orders.module";
import { HealthController } from "@infrastructure/http/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/backend/.env", ".env"],
    }),
    EventEmitterModule.forRoot(),
    AuthModule,
    RoadSegmentsModule,
    ReadingsModule,
    AlertsModule,
    WorkOrdersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
