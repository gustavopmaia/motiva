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
} from "@application/errors";
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

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<HttpRequest>();
    const response = context.getResponse<HttpResponse>();
    const status = this.getStatus(exception);
    const body = this.getBody(exception, status, request.originalUrl ?? request.url ?? "");

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR && process.env.NODE_ENV !== "production") {
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
        details: this.getDetails(exceptionBody, status),
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
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ApiErrorCode.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ApiErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ApiErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ApiErrorCode.RESOURCE_NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ApiErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ApiErrorCode.TOO_MANY_REQUESTS;
      default:
        return ApiErrorCode.INTERNAL_SERVER_ERROR;
    }
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
    if (Array.isArray(bodyMessage)) return "Validation failed.";
    if (typeof bodyMessage === "string" && bodyMessage) return bodyMessage;
    if (exception instanceof ApplicationError && exception.message) return exception.message;

    return this.getDefaultMessage(status);
  }

  private getDetails(
    exceptionBody: ExceptionBody | string | undefined,
    status: number,
  ): ErrorDetails {
    if (typeof exceptionBody === "object" && exceptionBody?.details) return exceptionBody.details;
    if (status !== HttpStatus.BAD_REQUEST || typeof exceptionBody !== "object") return {};

    const message = exceptionBody.message;
    if (!Array.isArray(message)) return {};

    return {
      fields: message.map((item) => ({
        field: item.split(" ")[0] ?? "body",
        message: item,
      })),
    };
  }

  private getDefaultMessage(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "Validation failed.";
      case HttpStatus.UNAUTHORIZED:
        return "Unauthorized.";
      case HttpStatus.FORBIDDEN:
        return "Forbidden.";
      case HttpStatus.NOT_FOUND:
        return "Resource not found.";
      case HttpStatus.CONFLICT:
        return "Conflict.";
      case HttpStatus.TOO_MANY_REQUESTS:
        return "Too many requests.";
      default:
        return "Internal server error.";
    }
  }

  private isDefaultRouteNotFound(exceptionBody: ExceptionBody | string | undefined): boolean {
    if (typeof exceptionBody !== "object") return false;
    return (
      typeof exceptionBody.message === "string" &&
      /^Cannot (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD) /.test(exceptionBody.message)
    );
  }
}
