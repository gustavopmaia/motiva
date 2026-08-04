import { ArgumentsHost, BadRequestException, Logger } from "@nestjs/common";
import { NotFoundError } from "./errors";
import { ApiErrorCode } from "./error-response";
import { GlobalExceptionFilter } from "./global-exception.filter";

jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});

const makeHost = (path = "/api/v1/example") => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: path }),
      getResponse: () => ({ status }),
    }),
  } as ArgumentsHost;

  return { host, status, json };
};

describe("GlobalExceptionFilter", () => {
  it("formats bad request errors with validation details", () => {
    const { host, status, json } = makeHost("/api/v1/auth/register");
    const filter = new GlobalExceptionFilter();

    filter.catch(
      new BadRequestException({
        message: "Invalid registration payload.",
        details: { fields: [{ field: "email", message: "email is required" }] },
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ApiErrorCode.VALIDATION_ERROR,
        message: "Invalid registration payload.",
        details: { fields: [{ field: "email", message: "email is required" }] },
        timestamp: expect.any(String),
        path: "/api/v1/auth/register",
      },
    });
  });

  it("maps application not found errors to resource not found responses", () => {
    const { host, status, json } = makeHost("/api/v1/work-orders/wo-1");
    const filter = new GlobalExceptionFilter();

    filter.catch(new NotFoundError("Work order not found"), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ApiErrorCode.RESOURCE_NOT_FOUND,
        message: "Work order not found",
        details: {},
        timestamp: expect.any(String),
        path: "/api/v1/work-orders/wo-1",
      },
    });
  });

  it("hides internal error details from the response", () => {
    const { host, status, json } = makeHost("/api/v1/example");
    const filter = new GlobalExceptionFilter();

    filter.catch(new Error("database connection string leaked"), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ApiErrorCode.INTERNAL_SERVER_ERROR,
        message: "Internal server error.",
        details: {},
        timestamp: expect.any(String),
        path: "/api/v1/example",
      },
    });
  });
});
