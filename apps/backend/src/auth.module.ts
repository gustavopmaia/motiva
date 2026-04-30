import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { RegisterUserUseCase } from "@application/use-cases/register-user.use-case";
import { LoginUseCase } from "@application/use-cases/login.use-case";
import { CreateApiKeyUseCase } from "@application/use-cases/create-api-key.use-case";
import { UserRepository } from "@domain/repositories/user.repository";
import { ApiKeyRepository } from "@domain/repositories/api-key.repository";
import { UserDrizzleRepository } from "@infrastructure/database/repositories/user.drizzle.repository";
import { ApiKeyDrizzleRepository } from "@infrastructure/database/repositories/api-key.drizzle.repository";
import { JwtAuthGuard } from "@infrastructure/http/guards/jwt.guard";
import { RolesGuard } from "@infrastructure/http/guards/roles.guard";
import { ApiKeyGuard } from "@infrastructure/http/guards/api-key.guard";
import { JwtStrategy } from "@infrastructure/http/strategies/jwt.strategy";
import { AuthController } from "@infrastructure/http/auth.controller";
import { DatabaseModule } from "./database.module";

@Module({
  imports: [
    DatabaseModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: "24h" },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    {
      provide: RegisterUserUseCase,
      useFactory: (userRepository: UserRepository) => new RegisterUserUseCase(userRepository),
      inject: [UserRepository],
    },
    {
      provide: LoginUseCase,
      useFactory: (userRepository: UserRepository, jwtService: JwtService) =>
        new LoginUseCase(userRepository, jwtService),
      inject: [UserRepository, JwtService],
    },
    {
      provide: CreateApiKeyUseCase,
      useFactory: (apiKeyRepository: ApiKeyRepository) => new CreateApiKeyUseCase(apiKeyRepository),
      inject: [ApiKeyRepository],
    },
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    ApiKeyGuard,
    { provide: UserRepository, useClass: UserDrizzleRepository },
    { provide: ApiKeyRepository, useClass: ApiKeyDrizzleRepository },
  ],
  controllers: [AuthController],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, ApiKeyGuard, UserRepository, ApiKeyRepository],
})
export class AuthModule {}
