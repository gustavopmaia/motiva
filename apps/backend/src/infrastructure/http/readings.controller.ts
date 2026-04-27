import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { CreateReadingUseCase } from "@application/use-cases/create-reading.use-case";
import { toCreateReadingInput } from "@infrastructure/readings/reading-input.mapper";
import {
  IotReadingRequestDto,
  ReadingResponseDto,
  SatelliteReadingRequestDto,
  VehicleReadingRequestDto,
} from "./dto/readings.docs";
import { ApiKeyGuard } from "./guards/api-key.guard";

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
  @ApiUnauthorizedResponse({ description: "The ingestion API key is missing or invalid." })
  async create(@Body() body: Record<string, unknown>) {
    try {
      if (!body || typeof body !== "object") throw new Error("Invalid payload");

      return await this.createReading.execute(toCreateReadingInput(body));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Invalid payload";
      throw new BadRequestException(message);
    }
  }
}
