import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { ReadingsService } from "@application/services/readings.service";
import { CreateReadingInput } from "@application/types/readings.types";
import { ApiKeySource } from "@domain/entities/api-key.entity";
import { toCreateReadingInput } from "@infrastructure/readings/reading-input.mapper";
import {
  IotReadingRequestDto,
  ReadingResponseDto,
  SatelliteReadingRequestDto,
  VehicleReadingRequestDto,
} from "./dto/readings.docs";
import { ApiKeyGuard } from "./guards/api-key.guard";

type ApiKeyRequest = {
  apiKeySource: ApiKeySource;
};

@ApiTags("Readings")
@ApiSecurity("api-key")
@ApiExtraModels(IotReadingRequestDto, VehicleReadingRequestDto, SatelliteReadingRequestDto)
@Controller("readings")
@UseGuards(ApiKeyGuard)
export class ReadingsController {
  constructor(private readonly readingsService: ReadingsService) {}

  @Post()
  @ApiOperation({
    summary: "Ingest a vegetation reading",
    description:
      "Accepts readings from IoT sensors, vehicle inspections, or satellite vegetation indexes. The backend matches the location to the nearest road segment, calculates a score, and updates alert workflows when thresholds are crossed.",
  })
  @ApiBody({
    description: "Reading payload. The required fields depend on the source value.",
    schema: {
      oneOf: [
        { $ref: getSchemaPath(IotReadingRequestDto) },
        { $ref: getSchemaPath(VehicleReadingRequestDto) },
        { $ref: getSchemaPath(SatelliteReadingRequestDto) },
      ],
    },
  })
  @ApiCreatedResponse({
    type: ReadingResponseDto,
    description: "Reading accepted, scored, and persisted.",
  })
  @ApiBadRequestResponse({
    description: "The reading payload is invalid.",
  })
  @ApiForbiddenResponse({
    description: "The authenticated API key source does not match the reading source.",
  })
  @ApiNotFoundResponse({ description: "No road segment can be matched to the reading location." })
  @ApiUnauthorizedResponse({ description: "The ingestion API key is missing or invalid." })
  async create(@Body() body: Record<string, unknown>, @Request() req: ApiKeyRequest) {
    if (!body || typeof body !== "object") {
      throw new BadRequestException({
        message: "Invalid reading payload.",
        details: { fields: [{ field: "body", message: "body must be an object" }] },
      });
    }

    let input: CreateReadingInput;
    try {
      input = toCreateReadingInput(body);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Invalid payload";
      const field = message.startsWith("Invalid ") ? message.slice("Invalid ".length) : "body";
      throw new BadRequestException({
        message: "Invalid reading payload.",
        details: { fields: [{ field, message }] },
      });
    }

    if (req.apiKeySource !== input.source) {
      throw new ForbiddenException("API key source does not match reading source");
    }

    const r = await this.readingsService.create(input);
    return {
      id: r.id,
      segmentId: r.segmentId,
      source: r.source,
      score: r.score,
      createdAt: r.createdAt,
    };
  }
}
