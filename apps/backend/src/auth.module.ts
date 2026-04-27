import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
import { AuthController } from "@infrastructure/http/auth.controller";
import { SeedService } from "@infrastructure/database/seed.service";
import { DatabaseModule } from "./database.module";

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: RegisterUserUseCase,
      useFactory: (userRepository: UserRepository) => new RegisterUserUseCase(userRepository),
      inject: [UserRepository],
    },
    {
      provide: LoginUseCase,
      useFactory: (userRepository: UserRepository, config: ConfigService) =>
        new LoginUseCase(userRepository, config.getOrThrow<string>("JWT_SECRET")),
      inject: [UserRepository, ConfigService],
    },
    {
      provide: CreateApiKeyUseCase,
      useFactory: (apiKeyRepository: ApiKeyRepository) => new CreateApiKeyUseCase(apiKeyRepository),
      inject: [ApiKeyRepository],
    },
    SeedService,
    JwtAuthGuard,
    RolesGuard,
    ApiKeyGuard,
    { provide: UserRepository, useClass: UserDrizzleRepository },
    { provide: ApiKeyRepository, useClass: ApiKeyDrizzleRepository },
  ],
  controllers: [AuthController],
  exports: [JwtAuthGuard, RolesGuard, ApiKeyGuard, UserRepository, ApiKeyRepository],
})
export class AuthModule {}
