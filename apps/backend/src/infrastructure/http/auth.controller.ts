import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { RegisterUserUseCase } from "@application/use-cases/register-user.use-case";
import { LoginUseCase } from "@application/use-cases/login.use-case";
import { CreateApiKeyUseCase } from "@application/use-cases/create-api-key.use-case";
import { UserRepository } from "@domain/repositories/user.repository";
import { ApiKeySource } from "@domain/entities/api-key.entity";
import { JwtAuthGuard } from "@infrastructure/http/guards/jwt.guard";
import { RolesGuard } from "@infrastructure/http/guards/roles.guard";
import { Roles } from "@infrastructure/http/decorators/roles.decorator";
import { AuthenticationError } from "@application/errors";
import { JwtPayload } from "@application/security/jwt";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly login: LoginUseCase,
    private readonly createApiKey: CreateApiKeyUseCase,
    private readonly userRepository: UserRepository,
  ) {}

  @Post("register")
  async register(@Body() body: Record<string, unknown>) {
    try {
      return await this.registerUser.execute(
        String(body.email ?? ""),
        String(body.name ?? ""),
        String(body.password ?? ""),
      );
    } catch (error: unknown) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid payload");
    }
  }

  @Post("login")
  async loginHandler(@Body() body: Record<string, unknown>) {
    try {
      return await this.login.execute(String(body.email ?? ""), String(body.password ?? ""));
    } catch (error: unknown) {
      if (error instanceof AuthenticationError) {
        throw new UnauthorizedException("Invalid credentials");
      }
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid payload");
    }
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@Request() req: { user: JwtPayload }) {
    const user = await this.userRepository.findById(req.user.sub);
    if (!user) throw new NotFoundException("User not found");
    const { password: _password, ...profile } = user;
    return profile;
  }

  @Post("api-keys")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("manager")
  async createKey(@Body() body: Record<string, unknown>) {
    const source = body.source;
    if (source !== "iot" && source !== "vehicle" && source !== "satellite") {
      throw new BadRequestException("source must be iot, vehicle, or satellite");
    }
    const name = typeof body.name === "string" && body.name ? body.name : `${source}-key`;
    const { apiKey, rawKey } = await this.createApiKey.execute(name, source as ApiKeySource);
    return {
      id: apiKey.id,
      name: apiKey.name,
      source: apiKey.source,
      key: rawKey,
      createdAt: apiKey.createdAt,
    };
  }
}
