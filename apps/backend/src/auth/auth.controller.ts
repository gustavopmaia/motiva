import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { UserRole } from "./user.entity";
import { JwtAuthGuard } from "./guards/jwt.guard";
import { RolesGuard } from "./guards/roles.guard";
import { Roles } from "./roles.decorator";
import { isJwtPayload, JwtPayload } from "./jwt-payload";
import {
  CreateApiKeyRequestDto,
  CreateApiKeyResponseDto,
  ForgotPasswordRequestDto,
  LoginRequestDto,
  LoginResponseDto,
  RegisterRequestDto,
  RegisterResponseDto,
  ResetPasswordRequestDto,
  UserProfileResponseDto,
} from "./auth.docs";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Post("register")
  @ApiOperation({
    summary: "Register a user",
    description:
      "Creates a new user account. A valid manager JWT must be provided; only managers can register users.",
  })
  @ApiBody({ type: RegisterRequestDto, description: "User registration payload." })
  @ApiCreatedResponse({
    type: RegisterResponseDto,
    description: "User account created successfully.",
  })
  @ApiBadRequestResponse({
    description: "The payload is invalid.",
  })
  @ApiConflictResponse({ description: "The email is already registered." })
  @ApiForbiddenResponse({
    description: "A valid manager JWT is required to register users.",
  })
  async register(@Body() body: RegisterRequestDto, @Headers("authorization") authHeader?: string) {
    return this.authService.register(
      body.email,
      body.name,
      body.password,
      this.roleFromHeader(authHeader),
      body.role === "manager" ? "manager" : "field",
    );
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
  async login(@Body() body: LoginRequestDto) {
    return this.authService.login(body.email, body.password);
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
    const user = await this.authService.getUserProfile(req.user.sub);
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
  async forgotPassword(@Body() body: ForgotPasswordRequestDto) {
    await this.authService.forgotPassword(body.email);
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
  async resetPassword(@Body() body: ResetPasswordRequestDto) {
    await this.authService.resetPassword(body.email, body.code, body.newPassword);
    return {};
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
  async createKey(@Body() body: CreateApiKeyRequestDto) {
    const { apiKey, rawKey } = await this.authService.createApiKey(
      body.name ?? `${body.source}-key`,
      body.source,
    );
    return {
      id: apiKey.id,
      name: apiKey.name,
      source: apiKey.source,
      key: rawKey,
      createdAt: apiKey.createdAt,
    };
  }

  private roleFromHeader(authHeader?: string): UserRole | null {
    if (!authHeader?.startsWith("Bearer ")) return null;

    try {
      const payload: unknown = this.jwtService.verify(authHeader.slice(7));
      return isJwtPayload(payload) ? payload.role : null;
    } catch {
      return null;
    }
  }
}
