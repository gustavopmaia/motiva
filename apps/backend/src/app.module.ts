import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth.module";
import { GeoJsonModule } from "./geojson.module";
import { HealthController } from "@infrastructure/http/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/backend/.env", ".env"],
    }),
    AuthModule,
    GeoJsonModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
