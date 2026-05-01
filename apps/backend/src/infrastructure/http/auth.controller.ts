import {
  BadRequestException,
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
import { AuthService } from "@application/services/auth.service";
import { ApiKeySource } from "@domain/entities/api-key.entity";
import { UserRole } from "@domain/entities/user.entity";
import { JwtAuthGuard } from "@infrastructure/http/guards/jwt.guard";
import { RolesGuard } from "@infrastructure/http/guards/roles.guard";
import { Roles } from "@infrastructure/http/decorators/roles.decorator";
import { JwtPayload } from "@application/security/jwt-payload";
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
} from "./dto/auth.docs";

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
      "If no manager exists yet, the first user is automatically created as manager. Afterwards, a valid manager JWT must be provided to register new field users.",
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
    description: "A manager JWT is required once the first manager account exists.",
  })
  async register(
    @Body() body: Record<string, unknown>,
    @Headers("authorization") authHeader?: string,
  ) {
    const input = parseRegisterBody(body);
    let requesterRole: UserRole | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const payload = this.jwtService.verify<JwtPayload>(authHeader.slice(7));
        requesterRole = payload.role as UserRole;
      } catch {}
    }

    return this.authService.register(
      input.email,
      input.name,
      input.password,
      requesterRole,
      input.targetRole,
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
  async loginHandler(@Body() body: Record<string, unknown>) {
    const input = parseLoginBody(body);
    return this.authService.login(input.email, input.password);
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
  async forgotPassword(@Body() body: Record<string, unknown>) {
    await this.authService.forgotPassword(String(body.email ?? ""));
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
    await this.authService.resetPassword(
      String(body.email ?? ""),
      String(body.code ?? ""),
      String(body.newPassword ?? ""),
    );
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
  async createKey(@Body() body: Record<string, unknown>) {
    const input = parseCreateApiKeyBody(body);
    const { apiKey, rawKey } = await this.authService.createApiKey(input.name, input.source);
    return {
      id: apiKey.id,
      name: apiKey.name,
      source: apiKey.source,
      key: rawKey,
      createdAt: apiKey.createdAt,
    };
  }
}

type RegisterInput = {
  email: string;
  name: string;
  password: string;
  targetRole: UserRole;
};

type LoginInput = {
  email: string;
  password: string;
};

type CreateApiKeyInput = {
  name: string;
  source: ApiKeySource;
};

function parseRegisterBody(body: Record<string, unknown>): RegisterInput {
  const email = String(body.email ?? "").trim();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");
  const fields: { field: string; message: string }[] = [];

  if (!email) fields.push({ field: "email", message: "email is required" });
  if (email && !email.includes("@")) {
    fields.push({ field: "email", message: "email must be a valid email" });
  }
  if (!name) fields.push({ field: "name", message: "name is required" });
  if (!password) fields.push({ field: "password", message: "password is required" });

  if (fields.length > 0) {
    throw new BadRequestException({
      message: "Invalid registration payload.",
      details: { fields },
    });
  }

  return {
    email,
    name,
    password,
    targetRole: body.role === "manager" ? "manager" : "field",
  };
}

function parseLoginBody(body: Record<string, unknown>): LoginInput {
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const fields: { field: string; message: string }[] = [];

  if (!email) fields.push({ field: "email", message: "email is required" });
  if (!password) fields.push({ field: "password", message: "password is required" });

  if (fields.length > 0) {
    throw new BadRequestException({
      message: "Invalid login payload.",
      details: { fields },
    });
  }

  return { email, password };
}

function parseCreateApiKeyBody(body: Record<string, unknown>): CreateApiKeyInput {
  const source = body.source;
  if (source !== "iot" && source !== "vehicle" && source !== "satellite") {
    throw new BadRequestException({
      message: "Invalid API key payload.",
      details: {
        fields: [{ field: "source", message: "source must be iot, vehicle, or satellite" }],
      },
    });
  }

  return {
    source,
    name: typeof body.name === "string" && body.name ? body.name : `${source}-key`,
  };
}
