import { Module } from "@nestjs/common";
import { RegisterUseCase } from "@application/use-cases/register.use-case";
import { IUserRepository } from "@domain/repositories/user.repository";
import { DrizzleUserRepository } from "@infrastructure/database/repositories/drizzle.user.repository";
import { AuthController } from "@infrastructure/http/auth.controller";
import { DatabaseModule } from "./database.module";

@Module({
  imports: [DatabaseModule],
  providers: [
    RegisterUseCase,
    {
      provide: IUserRepository,
      useClass: DrizzleUserRepository,
    },
  ],
  controllers: [AuthController],
})
export class AuthModule {}
