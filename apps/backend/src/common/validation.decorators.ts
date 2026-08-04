import { applyDecorators } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import { Contains, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

const required = ({ property }: { property: string }) => `${property} is required`;
const mustBeString = ({ property }: { property: string }) => `${property} must be a string`;
const mustBeNumber = ({ property }: { property: string }) => `${property} must be a number`;

export function formatList(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} or ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, or ${values[values.length - 1]}`;
}

const trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value));

export function RequiredString(opts: { trim?: boolean } = {}) {
  return applyDecorators(
    ...(opts.trim ? [trim()] : []),
    IsNotEmpty({ message: required }),
    IsString({ message: mustBeString }),
  );
}

export function OptionalString(opts: { trim?: boolean } = {}) {
  return applyDecorators(
    ...(opts.trim ? [trim()] : []),
    IsOptional(),
    IsString({ message: mustBeString }),
  );
}

export function RequiredNumber() {
  return applyDecorators(
    Type(() => Number),
    IsNumber({}, { message: mustBeNumber }),
  );
}

export function OptionalNumber() {
  return applyDecorators(
    IsOptional(),
    Type(() => Number),
    IsNumber({}, { message: mustBeNumber }),
  );
}

export function RequiredEnum(values: readonly string[]) {
  return applyDecorators(
    IsIn(values, {
      message: ({ property }) => `${property} must be ${formatList(values)}`,
    }),
  );
}

export function RequiredEmail() {
  return applyDecorators(
    RequiredString({ trim: true }),
    Contains("@", { message: ({ property }) => `${property} must be a valid email` }),
  );
}
