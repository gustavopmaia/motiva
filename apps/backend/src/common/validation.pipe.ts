import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { ValidationError } from "class-validator";
import { FieldError } from "./error-response";

const DEFAULT_MESSAGE = "Validation failed.";

const CONSTRAINT_PRIORITY = ["isDefined", "isNotEmpty", "isString", "isNumber", "isIn", "contains"];

type DtoConstructor = { validationMessage?: string };

function pickMessage(constraints: Record<string, string>): string {
  for (const key of CONSTRAINT_PRIORITY) {
    if (constraints[key]) return constraints[key];
  }
  return Object.values(constraints)[0] ?? "is invalid";
}

export function toFieldErrors(errors: ValidationError[], parent = ""): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, message: pickMessage(error.constraints) }] : [];
    return [...own, ...toFieldErrors(error.children ?? [], field)];
  });
}

function messageFor(errors: ValidationError[]): string {
  const target = errors[0]?.target;
  const dto = target?.constructor as DtoConstructor | undefined;
  return dto?.validationMessage ?? DEFAULT_MESSAGE;
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    validationError: { target: true, value: false },
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        message: messageFor(errors),
        details: { fields: toFieldErrors(errors) },
      }),
  });
}
