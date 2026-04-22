import { Module } from "@nestjs/common";
import { RegisterUserUseCase } from "@application/use-cases/register-user.use-case";
import { IUserRepository } from "@domain/repositories/user.repository";
import { UserDrizzleRepository } from "@infrastructure/database/repositories/user.drizzle.repository";
import { AuthController } from "@infrastructure/http/auth.controller";
import { DatabaseModule } from "./database.module";

@Module({
  imports: [DatabaseModule],
  providers: [
    RegisterUserUseCase,
    {
      provide: IUserRepository,
      useClass: UserDrizzleRepository,
    },
  ],
  controllers: [AuthController],
})
export class AuthModule {}
