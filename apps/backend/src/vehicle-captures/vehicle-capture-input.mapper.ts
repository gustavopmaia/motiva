import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { FieldError } from "../common/error-response";
import { toFieldErrors } from "../common/validation.pipe";
import { VehicleCaptureRequestDto } from "./vehicle-captures.docs";

export class InvalidVehicleCapturePayloadError extends Error {
  constructor(readonly fields: FieldError[]) {
    super(fields.map((f) => f.message).join("; "));
  }
}

export type CreateVehicleCaptureInput = {
  lat: number;
  lon: number;
  capturedAt: Date;
};

export function toCreateVehicleCaptureInput(
  body: Record<string, unknown>,
): CreateVehicleCaptureInput {
  const instance = plainToInstance(VehicleCaptureRequestDto, body);
  const errors = validateSync(instance, { whitelist: true });
  if (errors.length > 0) throw new InvalidVehicleCapturePayloadError(toFieldErrors(errors));

  return {
    lat: instance.lat,
    lon: instance.lon,
    capturedAt: new Date(instance.capturedAt),
  };
}
