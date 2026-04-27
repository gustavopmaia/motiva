import { CreateReadingInput } from "@application/types/readings.types";

export function toCreateReadingInput(body: Record<string, unknown>): CreateReadingInput {
  const source = body.source;
  if (source !== "iot" && source !== "vehicle" && source !== "satellite") {
    throw new Error("Invalid source");
  }

  if (source === "iot") {
    return toIotReadingInput(body, typeof body.nodeId === "string" ? body.nodeId : undefined);
  }

  const lat = toNumber(body.lat, "lat");
  const lon = toNumber(body.lon, "lon");
  const metadata = readMetadata(body);

  if (source === "vehicle") {
    if (
      body.classification !== "ok" &&
      body.classification !== "attention" &&
      body.classification !== "urgent"
    ) {
      throw new Error("Invalid classification");
    }

    return {
      source,
      lat,
      lon,
      classification: body.classification,
      confidence: toNumber(body.confidence, "confidence"),
      metadata: emptyToNull(metadata),
    };
  }

  const ndvi = toNumber(body.ndvi, "ndvi");
  return {
    source,
    lat,
    lon,
    ndvi,
    confidence: body.confidence == null ? undefined : toNumber(body.confidence, "confidence"),
    metadata: {
      ...metadata,
      ndvi,
    },
  };
}

export function toIotReadingInput(
  body: Record<string, unknown>,
  nodeId?: string,
): CreateReadingInput {
  const metadata = readMetadata(body);
  if (nodeId) metadata.nodeId = nodeId;

  return {
    source: "iot",
    lat: toNumber(body.lat, "lat"),
    lon: toNumber(body.lon, "lon"),
    heightCm: toNumber(body.heightCm, "heightCm"),
    confidence: body.confidence == null ? undefined : toNumber(body.confidence, "confidence"),
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

function toNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid ${field}`);
  return number;
}
