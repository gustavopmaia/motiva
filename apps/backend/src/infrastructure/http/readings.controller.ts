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
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { CreateReadingUseCase } from "@application/use-cases/create-reading.use-case";
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
  constructor(private readonly createReading: CreateReadingUseCase) {}

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
    description: "The reading payload is invalid or no road segment can be matched.",
  })
  @ApiForbiddenResponse({
    description: "The authenticated API key source does not match the reading source.",
  })
  @ApiUnauthorizedResponse({ description: "The ingestion API key is missing or invalid." })
  async create(@Body() body: Record<string, unknown>, @Request() req: ApiKeyRequest) {
    try {
      if (!body || typeof body !== "object") throw new Error("Invalid payload");

      const input = toCreateReadingInput(body);
      if (req.apiKeySource !== input.source) {
        throw new ForbiddenException("API key source does not match reading source");
      }

      return await this.createReading.execute(input);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) throw error;

      const message = error instanceof Error ? error.message : "Invalid payload";
      throw new BadRequestException(message);
    }
  }
}
