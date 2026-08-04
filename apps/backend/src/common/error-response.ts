import { ApiProperty } from "@nestjs/swagger";

export enum ApiErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",
  CONFLICT = "CONFLICT",
  TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS",
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
}

export type ErrorDetails = Record<string, unknown>;

export type FieldError = { field: string; message: string };

export type ApiErrorResponse = {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details: ErrorDetails;
    timestamp: string;
    path: string;
  };
};

class ApiErrorBodyDto {
  @ApiProperty({
    description: "Stable error code for frontend and API documentation.",
    enum: ApiErrorCode,
    example: ApiErrorCode.VALIDATION_ERROR,
  })
  code!: ApiErrorCode;

  @ApiProperty({
    description: "Safe, human-readable error message.",
    example: "Validation failed.",
  })
  message!: string;

  @ApiProperty({
    description: "Additional structured details about the error.",
    example: { fields: [{ field: "email", message: "email is required" }] },
  })
  details!: ErrorDetails;

  @ApiProperty({
    description: "Date and time when the error response was produced.",
    example: "2026-05-01T12:00:00.000Z",
  })
  timestamp!: string;

  @ApiProperty({
    description: "Request path that produced the error.",
    example: "/api/v1/auth/register",
  })
  path!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({
    description: "Always false for error responses.",
    example: false,
  })
  success!: false;

  @ApiProperty({ type: ApiErrorBodyDto })
  error!: ApiErrorBodyDto;
}
