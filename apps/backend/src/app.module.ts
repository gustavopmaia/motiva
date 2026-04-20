import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth.module";
import { DrizzleService } from "./infrastructure/database/drizzle.service";
import { HealthController } from "./infrastructure/http/health.controller";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
  controllers: [HealthController],
  providers: [DrizzleService],
  exports: [DrizzleService],
})
export class AppModule {}
