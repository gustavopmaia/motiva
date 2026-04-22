import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth.module";
import { HealthController } from "@infrastructure/http/health.controller";
import { KmzModule } from "./kmz.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/backend/.env", ".env"],
    }),
    AuthModule,
    KmzModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
