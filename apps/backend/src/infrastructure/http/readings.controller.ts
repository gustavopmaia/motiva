import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CreateReadingInput } from "@application/types/readings.types";
import { CreateReadingUseCase } from "@application/use-cases/create-reading.use-case";
import { ApiKeyGuard } from "./guards/api-key.guard";

@Controller("readings")
@UseGuards(ApiKeyGuard)
export class ReadingsController {
  constructor(private readonly createReading: CreateReadingUseCase) {}

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    try {
      if (!body || typeof body !== "object") throw new Error("Invalid payload");

      const source = body.source;
      if (source !== "iot" && source !== "vehicle" && source !== "satellite") {
        throw new Error("Invalid source");
      }

      const lat = this.toNumber(body.lat, "lat");
      const lon = this.toNumber(body.lon, "lon");
      const metadata =
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? { ...(body.metadata as Record<string, unknown>) }
          : {};
      let input: CreateReadingInput;

      if (source === "iot") {
        if (typeof body.nodeId === "string") metadata.nodeId = body.nodeId;

        input = {
          source,
          lat,
          lon,
          heightCm: this.toNumber(body.heightCm, "heightCm"),
          confidence:
            body.confidence == null ? undefined : this.toNumber(body.confidence, "confidence"),
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
        };
      } else if (source === "vehicle") {
        if (
          body.classification !== "ok" &&
          body.classification !== "attention" &&
          body.classification !== "urgent"
        ) {
          throw new Error("Invalid classification");
        }

        input = {
          source,
          lat,
          lon,
          classification: body.classification,
          confidence: this.toNumber(body.confidence, "confidence"),
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
        };
      } else {
        const ndvi = this.toNumber(body.ndvi, "ndvi");

        input = {
          source,
          lat,
          lon,
          ndvi,
          confidence:
            body.confidence == null ? undefined : this.toNumber(body.confidence, "confidence"),
          metadata: {
            ...metadata,
            ndvi,
          },
        };
      }

      return await this.createReading.execute(input);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Invalid payload";
      throw new BadRequestException(message);
    }
  }

  private toNumber(value: unknown, field: string) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Invalid ${field}`);
    return number;
  }
}
