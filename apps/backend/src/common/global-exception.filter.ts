import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import {
  ApplicationError,
  AuthenticationError,
  AuthorizationError,
  DuplicateResourceError,
  InvalidOperationError,
  NotFoundError,
  TooManyRequestsError,
} from "./errors";
import { ApiErrorCode, ApiErrorResponse, ErrorDetails } from "./error-response";

type HttpRequest = {
  originalUrl?: string;
  url?: string;
};

type HttpResponse = {
  status(statusCode: number): {
    json(body: ApiErrorResponse): void;
  };
};

type ExceptionBody = {
  message?: string | string[];
  error?: string;
  details?: ErrorDetails;
};

const BY_STATUS: Record<number, { code: ApiErrorCode; message: string }> = {
  [HttpStatus.BAD_REQUEST]: { code: ApiErrorCode.VALIDATION_ERROR, message: "Validation failed." },
  [HttpStatus.UNAUTHORIZED]: { code: ApiErrorCode.UNAUTHORIZED, message: "Unauthorized." },
  [HttpStatus.FORBIDDEN]: { code: ApiErrorCode.FORBIDDEN, message: "Forbidden." },
  [HttpStatus.NOT_FOUND]: {
    code: ApiErrorCode.RESOURCE_NOT_FOUND,
    message: "Resource not found.",
  },
  [HttpStatus.CONFLICT]: { code: ApiErrorCode.CONFLICT, message: "Conflict." },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: ApiErrorCode.TOO_MANY_REQUESTS,
    message: "Too many requests.",
  },
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly logStackTraces = process.env.NODE_ENV !== "production") {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<HttpRequest>();
    const response = context.getResponse<HttpResponse>();
    const status = this.getStatus(exception);
    const body = this.getBody(exception, status, request.originalUrl ?? request.url ?? "");

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR && this.logStackTraces) {
      this.logger.error(
        body.error.message,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private getStatus(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    if (exception instanceof AuthenticationError) return HttpStatus.UNAUTHORIZED;
    if (exception instanceof AuthorizationError) return HttpStatus.FORBIDDEN;
    if (exception instanceof NotFoundError) return HttpStatus.NOT_FOUND;
    if (exception instanceof DuplicateResourceError) return HttpStatus.CONFLICT;
    if (exception instanceof TooManyRequestsError) return HttpStatus.TOO_MANY_REQUESTS;
    if (exception instanceof InvalidOperationError) return HttpStatus.BAD_REQUEST;
    if (exception instanceof ApplicationError) return HttpStatus.BAD_REQUEST;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getBody(exception: unknown, status: number, path: string): ApiErrorResponse {
    const exceptionBody = this.getExceptionBody(exception);
    const message = this.getMessage(exception, exceptionBody, status);

    return {
      success: false,
      error: {
        code: this.getCode(status),
        message,
        details: this.getDetails(exceptionBody),
        timestamp: new Date().toISOString(),
        path,
      },
    };
  }

  private getExceptionBody(exception: unknown): ExceptionBody | string | undefined {
    if (!(exception instanceof HttpException)) return undefined;
    return exception.getResponse() as ExceptionBody | string;
  }

  private getCode(status: number): ApiErrorCode {
    return BY_STATUS[status]?.code ?? ApiErrorCode.INTERNAL_SERVER_ERROR;
  }

  private getMessage(
    exception: unknown,
    exceptionBody: ExceptionBody | string | undefined,
    status: number,
  ): string {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) return "Internal server error.";
    if (status === HttpStatus.NOT_FOUND && this.isDefaultRouteNotFound(exceptionBody)) {
      return "Resource not found.";
    }

    if (typeof exceptionBody === "string") return exceptionBody;

    const bodyMessage = exceptionBody?.message;
    if (typeof bodyMessage === "string" && bodyMessage) return bodyMessage;
    if (exception instanceof ApplicationError && exception.message) return exception.message;

    return BY_STATUS[status]?.message ?? "Internal server error.";
  }

  private getDetails(exceptionBody: ExceptionBody | string | undefined): ErrorDetails {
    if (typeof exceptionBody === "object" && exceptionBody?.details) return exceptionBody.details;
    return {};
  }

  private isDefaultRouteNotFound(exceptionBody: ExceptionBody | string | undefined): boolean {
    if (typeof exceptionBody !== "object") return false;
    return (
      typeof exceptionBody.message === "string" &&
      /^Cannot (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD) /.test(exceptionBody.message)
    );
  }
}
