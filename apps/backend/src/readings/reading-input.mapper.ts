import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateReadingInput } from "./readings.types";
import { READING_SOURCES } from "./reading.entity";
import { FieldError } from "../common/error-response";
import { formatList } from "../common/validation.decorators";
import { toFieldErrors } from "../common/validation.pipe";
import {
  IotReadingRequestDto,
  SatelliteReadingRequestDto,
  VehicleReadingRequestDto,
} from "./readings.docs";

export class InvalidReadingPayloadError extends Error {
  constructor(readonly fields: FieldError[]) {
    super(fields.map((f) => f.message).join("; "));
  }
}

const DTO_BY_SOURCE = {
  iot: IotReadingRequestDto,
  vehicle: VehicleReadingRequestDto,
  satellite: SatelliteReadingRequestDto,
};

function validateAs<T extends object>(dto: new () => T, body: Record<string, unknown>): T {
  const instance = plainToInstance(dto, body);
  const errors = validateSync(instance, { whitelist: true });
  if (errors.length > 0) throw new InvalidReadingPayloadError(toFieldErrors(errors));
  return instance;
}

export function toCreateReadingInput(body: Record<string, unknown>): CreateReadingInput {
  const source = body.source;
  if (typeof source !== "string" || !Object.prototype.hasOwnProperty.call(DTO_BY_SOURCE, source)) {
    throw new InvalidReadingPayloadError([
      { field: "source", message: `source must be ${formatList(READING_SOURCES)}` },
    ]);
  }

  if (source === "iot") {
    return toIotReadingInput(body, typeof body.nodeId === "string" ? body.nodeId : undefined);
  }

  if (source === "vehicle") {
    const dto = validateAs(VehicleReadingRequestDto, body);
    return {
      source: "vehicle",
      ...observationIdentity(body),
      lat: dto.lat,
      lon: dto.lon,
      classification: dto.classification,
      confidence: dto.confidence,
      metadata: emptyToNull(readMetadata(body)),
    };
  }

  const dto = validateAs(SatelliteReadingRequestDto, body);
  return {
    source: "satellite",
    ...observationIdentity(body),
    lat: dto.lat,
    lon: dto.lon,
    ndvi: dto.ndvi,
    confidence: dto.confidence,
    metadata: { ...readMetadata(body), ndvi: dto.ndvi },
  };
}

export function toIotReadingInput(
  body: Record<string, unknown>,
  nodeId?: string,
): CreateReadingInput {
  const dto = validateAs(IotReadingRequestDto, body);

  const metadata = readMetadata(body);
  if (nodeId) metadata.nodeId = nodeId;

  return {
    source: "iot",
    ...observationIdentity(body, nodeId),
    lat: dto.lat,
    lon: dto.lon,
    heightCm: dto.heightCm,
    confidence: dto.confidence,
    metadata: emptyToNull(metadata),
  };
}

function readMetadata(body: Record<string, unknown>): Record<string, unknown> {
  return body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? { ...(body.metadata as Record<string, unknown>) }
    : {};
}

function emptyToNull(metadata: Record<string, unknown>): Record<string, unknown> | null {
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function observationIdentity(
  body: Record<string, unknown>,
  nodeId?: string,
): { observedAt?: Date; originKey?: string } {
  const fields: { observedAt?: Date; originKey?: string } = {};
  if (body.observedAt !== undefined) {
    if (
      typeof body.observedAt !== "string" ||
      !Number.isFinite(Date.parse(body.observedAt)) ||
      Date.parse(body.observedAt) > Date.now() + 300000
    ) {
      throw new InvalidReadingPayloadError([
        {
          field: "observedAt",
          message: "observedAt must be a valid timestamp no more than 5 minutes in the future",
        },
      ]);
    }
    fields.observedAt = new Date(body.observedAt);
  }
  if (body.eventId !== undefined) {
    if (typeof body.eventId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.eventId))
      throw new InvalidReadingPayloadError([
        {
          field: "eventId",
          message: "eventId must contain 1 to 128 letters, digits, underscores or hyphens",
        },
      ]);
    fields.originKey = nodeId ? `${nodeId}:${body.eventId}` : body.eventId;
  }
  return fields;
}
