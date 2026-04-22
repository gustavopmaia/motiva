import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth.module";
import { RoadSegmentsModule } from "./road-segments.module";
import { HealthController } from "@infrastructure/http/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/backend/.env", ".env"],
    }),
    AuthModule,
    RoadSegmentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
