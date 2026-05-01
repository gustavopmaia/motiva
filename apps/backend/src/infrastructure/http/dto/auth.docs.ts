import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RegisterRequestDto {
  @ApiProperty({
    description: "Email address used as the unique login identifier.",
    example: "manager@motiva.app",
  })
  email!: string;

  @ApiProperty({
    description: "Display name stored for the user.",
    example: "Operations Manager",
  })
  name!: string;

  @ApiProperty({
    description:
      "Plain text password that will be hashed before storage. Minimum 8 characters, at least one letter and one digit.",
    example: "change-me-123",
  })
  password!: string;
}

export class LoginRequestDto {
  @ApiProperty({
    description: "Email address for the account attempting to log in.",
    example: "manager@motiva.app",
  })
  email!: string;

  @ApiProperty({
    description: "Plain text password for the account.",
    example: "change-me-123",
  })
  password!: string;
}

export class LoginResponseDto {
  @ApiProperty({
    description: "Signed JWT access token used as a Bearer token on protected routes.",
    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  })
  accessToken!: string;
}

export class UserProfileResponseDto {
  @ApiProperty({
    description: "Unique user identifier.",
    example: "4f1a6e8f-6f8a-4d44-9c2a-9e75a6d574df",
  })
  id!: string;

  @ApiProperty({
    description: "Email address used by the user to authenticate.",
    example: "manager@motiva.app",
  })
  email!: string;

  @ApiProperty({
    description: "Display name associated with the user.",
    example: "Operations Manager",
  })
  name!: string;

  @ApiProperty({
    description: "Authorization role assigned to the user.",
    enum: ["manager", "field"],
    example: "manager",
  })
  role!: string;

  @ApiProperty({
    description: "Date and time when the user was created.",
    example: "2026-04-27T12:00:00.000Z",
  })
  createdAt!: string;
}

export class ForgotPasswordRequestDto {
  @ApiProperty({
    description: "Email address associated with the account.",
    example: "manager@motiva.app",
  })
  email!: string;
}

export class ResetPasswordRequestDto {
  @ApiProperty({
    description: "Email address associated with the account.",
    example: "manager@motiva.app",
  })
  email!: string;

  @ApiProperty({
    description: "6-digit reset code sent to the email.",
    example: "112233",
  })
  code!: string;

  @ApiProperty({
    description: "New password. Minimum 8 characters, at least one letter and one digit.",
    example: "new-password-1",
  })
  newPassword!: string;
}

export class CreateApiKeyRequestDto {
  @ApiPropertyOptional({
    description: "Human-readable name for the key. Defaults to a source-based name when omitted.",
    example: "iot-main-gateway",
  })
  name?: string;

  @ApiProperty({
    description: "Trusted source that will use this API key to ingest readings.",
    enum: ["iot", "vehicle", "satellite"],
    example: "iot",
  })
  source!: string;
}

export class CreateApiKeyResponseDto {
  @ApiProperty({
    description: "Unique API key record identifier.",
    example: "fb7bb155-2d63-4c3f-8b79-918e8f197f1e",
  })
  id!: string;

  @ApiProperty({
    description: "Human-readable name stored for the API key.",
    example: "iot-main-gateway",
  })
  name!: string;

  @ApiProperty({
    description: "Trusted ingestion source associated with this key.",
    enum: ["iot", "vehicle", "satellite"],
    example: "iot",
  })
  source!: string;

  @ApiProperty({
    description: "Raw API key value. This value is returned only when the key is created.",
    example: "87a17c5cf02dc4ef9f3b872d95aa0ed1b08e4e9e5d87e80b24ad7b8e09c4a913",
  })
  key!: string;

  @ApiProperty({
    description: "Date and time when the API key was created.",
    example: "2026-04-27T12:00:00.000Z",
  })
  createdAt!: string;
}
