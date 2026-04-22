import { Controller, Post, Body, BadRequestException } from "@nestjs/common";
import { RegisterUserUseCase } from "@application/use-cases/register-user.use-case";

@Controller("auth")
export class AuthController {
  constructor(private readonly registerUser: RegisterUserUseCase) {}

  @Post("register")
  async register(@Body() body: any) {
    try {
      return await this.registerUser.execute(body.email, body.name, body.password);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }
}
