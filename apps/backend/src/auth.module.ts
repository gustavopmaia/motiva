import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { RegisterUserUseCase } from "@application/use-cases/register-user.use-case";
import { LoginUseCase } from "@application/use-cases/login.use-case";
import { CreateApiKeyUseCase } from "@application/use-cases/create-api-key.use-case";
import { ForgotPasswordUseCase } from "@application/use-cases/forgot-password.use-case";
import { ResetPasswordUseCase } from "@application/use-cases/reset-password.use-case";
import { UserRepository } from "@domain/repositories/user.repository";
import { ApiKeyRepository } from "@domain/repositories/api-key.repository";
import { PasswordResetTokenRepository } from "@domain/repositories/password-reset-token.repository";
import { UserDrizzleRepository } from "@infrastructure/database/repositories/user.drizzle.repository";
import { ApiKeyDrizzleRepository } from "@infrastructure/database/repositories/api-key.drizzle.repository";
import { PasswordResetTokenDrizzleRepository } from "@infrastructure/database/repositories/password-reset-token.drizzle.repository";
import { JwtAuthGuard } from "@infrastructure/http/guards/jwt.guard";
import { RolesGuard } from "@infrastructure/http/guards/roles.guard";
import { ApiKeyGuard } from "@infrastructure/http/guards/api-key.guard";
import { AuthController } from "@infrastructure/http/auth.controller";
import { DatabaseModule } from "./database.module";

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
  providers: [
    RegisterUserUseCase,
    LoginUseCase,
    CreateApiKeyUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    JwtAuthGuard,
    RolesGuard,
    ApiKeyGuard,
    { provide: UserRepository, useClass: UserDrizzleRepository },
    { provide: ApiKeyRepository, useClass: ApiKeyDrizzleRepository },
    { provide: PasswordResetTokenRepository, useClass: PasswordResetTokenDrizzleRepository },
  ],
  controllers: [AuthController],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, ApiKeyGuard, UserRepository, ApiKeyRepository],
})
export class AuthModule {}
