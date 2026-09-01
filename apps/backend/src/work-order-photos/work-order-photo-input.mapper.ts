import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { FieldError } from "../common/error-response";
import { toFieldErrors } from "../common/validation.pipe";
import { WorkOrderPhotoRequestDto } from "./work-order-photos.docs";

export class InvalidWorkOrderPhotoPayloadError extends Error {
  constructor(readonly fields: FieldError[]) {
    super(fields.map((f) => f.message).join("; "));
  }
}

export type CreateWorkOrderPhotoInput = {
  lat: number;
  lon: number;
  capturedAt: Date;
};

export function toCreateWorkOrderPhotoInput(
  body: Record<string, unknown>,
): CreateWorkOrderPhotoInput {
  const instance = plainToInstance(WorkOrderPhotoRequestDto, body);
  const errors = validateSync(instance, { whitelist: true });
  if (errors.length > 0) throw new InvalidWorkOrderPhotoPayloadError(toFieldErrors(errors));

  return {
    lat: instance.lat,
    lon: instance.lon,
    capturedAt: new Date(instance.capturedAt),
  };
}
