import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt.guard";
import { RolesGuard } from "./guards/roles.guard";
import { ApiKeyGuard } from "./guards/api-key.guard";
import { AuthController } from "./auth.controller";
import { DatabaseModule } from "../database/database.module";

@Module({
  imports: [
    DatabaseModule,
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: "24h" },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtAuthGuard, RolesGuard, ApiKeyGuard],
  controllers: [AuthController],
  exports: [JwtModule, AuthService, JwtAuthGuard, RolesGuard, ApiKeyGuard],
})
export class AuthModule {}
