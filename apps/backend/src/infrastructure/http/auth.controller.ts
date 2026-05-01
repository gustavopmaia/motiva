import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { JwtService } from "@nestjs/jwt";
import { RegisterUserUseCase } from "@application/use-cases/register-user.use-case";
import { LoginUseCase } from "@application/use-cases/login.use-case";
import { CreateApiKeyUseCase } from "@application/use-cases/create-api-key.use-case";
import { ForgotPasswordUseCase } from "@application/use-cases/forgot-password.use-case";
import { ResetPasswordUseCase } from "@application/use-cases/reset-password.use-case";
import { UserRepository } from "@domain/repositories/user.repository";
import { ApiKeySource } from "@domain/entities/api-key.entity";
import { UserRole } from "@domain/entities/user.entity";
import { JwtAuthGuard } from "@infrastructure/http/guards/jwt.guard";
import { RolesGuard } from "@infrastructure/http/guards/roles.guard";
import { Roles } from "@infrastructure/http/decorators/roles.decorator";
import { AuthenticationError, AuthorizationError, TooManyRequestsError } from "@application/errors";
import { JwtPayload } from "@application/security/jwt-payload";
import {
  CreateApiKeyRequestDto,
  CreateApiKeyResponseDto,
  ForgotPasswordRequestDto,
  LoginRequestDto,
  LoginResponseDto,
  RegisterRequestDto,
  ResetPasswordRequestDto,
  UserProfileResponseDto,
} from "./dto/auth.docs";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly login: LoginUseCase,
    private readonly createApiKey: CreateApiKeyUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    @Inject(UserRepository)
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
  ) {}

  @Post("register")
  @ApiOperation({
    summary: "Register a user",
    description:
      "If no manager exists yet, the first user is automatically created as manager. Afterwards, a valid manager JWT must be provided to register new field users.",
  })
  @ApiBody({ type: RegisterRequestDto, description: "User registration payload." })
  @ApiCreatedResponse({
    type: UserProfileResponseDto,
    description: "User account created successfully.",
  })
  @ApiBadRequestResponse({
    description: "The payload is invalid or the email is already registered.",
  })
  @ApiForbiddenResponse({
    description: "A manager JWT is required once the first manager account exists.",
  })
  async register(
    @Body() body: Record<string, unknown>,
    @Headers("authorization") authHeader?: string,
  ) {
    let requesterRole: UserRole | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const payload = this.jwtService.verify<JwtPayload>(authHeader.slice(7));
        requesterRole = payload.role as UserRole;
      } catch {}
    }

    try {
      return await this.registerUser.execute(
        String(body.email ?? ""),
        String(body.name ?? ""),
        String(body.password ?? ""),
        requesterRole,
      );
    } catch (error: unknown) {
      if (error instanceof AuthorizationError) throw new ForbiddenException(error.message);
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid payload");
    }
  }

  @Post("login")
  @ApiOperation({
    summary: "Log in",
    description:
      "Authenticates a user with email and password, then returns a JWT access token for protected endpoints.",
  })
  @ApiBody({ type: LoginRequestDto, description: "Credentials used to authenticate the user." })
  @ApiOkResponse({
    type: LoginResponseDto,
    description: "Authentication succeeded and an access token was issued.",
  })
  @ApiUnauthorizedResponse({ description: "The credentials are invalid." })
  @ApiBadRequestResponse({ description: "The login payload is invalid." })
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
  @ApiBearerAuth("jwt")
  @ApiOperation({
    summary: "Get current user",
    description: "Returns the authenticated user profile without the password hash.",
  })
  @ApiOkResponse({ type: UserProfileResponseDto, description: "Authenticated user profile." })
  @ApiUnauthorizedResponse({
    description: "The JWT access token is missing, invalid, expired, or cannot be verified.",
  })
  @ApiNotFoundResponse({ description: "The authenticated user no longer exists." })
  async me(@Request() req: { user: JwtPayload }) {
    const user = await this.userRepository.findById(req.user.sub);
    if (!user) throw new NotFoundException("User not found");
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  @Post("forgot-password")
  @ApiOperation({
    summary: "Request a password reset code",
    description:
      "Sends a reset code to the provided email. Always returns 200 to avoid leaking whether an account exists. Limited to 3 requests per email every 15 minutes.",
  })
  @ApiBody({ type: ForgotPasswordRequestDto })
  @ApiOkResponse({ description: "Request processed." })
  async forgotPassword(@Body() body: Record<string, unknown>) {
    try {
      await this.forgotPasswordUseCase.execute(String(body.email ?? ""));
    } catch (error: unknown) {
      if (error instanceof TooManyRequestsError) {
        throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    return {};
  }

  @Post("reset-password")
  @ApiOperation({
    summary: "Reset password using a code",
    description:
      "Validates the reset code and updates the password. Codes expire after 15 minutes and can only be used once.",
  })
  @ApiBody({ type: ResetPasswordRequestDto })
  @ApiOkResponse({ description: "Password updated successfully." })
  @ApiBadRequestResponse({
    description: "The code is invalid, expired, or the new password does not meet requirements.",
  })
  async resetPassword(@Body() body: Record<string, unknown>) {
    try {
      await this.resetPasswordUseCase.execute(
        String(body.email ?? ""),
        String(body.code ?? ""),
        String(body.newPassword ?? ""),
      );
      return {};
    } catch (error: unknown) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid or expired code",
      );
    }
  }

  @Post("api-keys")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("manager")
  @ApiBearerAuth("jwt")
  @ApiOperation({
    summary: "Create an ingestion API key",
    description:
      "Creates an API key for a trusted ingestion source. Only manager users can create keys. The raw key is returned only once.",
  })
  @ApiBody({ type: CreateApiKeyRequestDto, description: "API key metadata and source." })
  @ApiCreatedResponse({
    type: CreateApiKeyResponseDto,
    description: "API key created successfully. Store the raw key immediately.",
  })
  @ApiBadRequestResponse({
    description: "The source is invalid or the payload cannot be processed.",
  })
  @ApiUnauthorizedResponse({
    description: "The JWT access token is missing, invalid, expired, or cannot be verified.",
  })
  @ApiForbiddenResponse({
    description: "The authenticated user does not have the manager role.",
  })
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
