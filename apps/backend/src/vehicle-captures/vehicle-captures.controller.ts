import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBadRequestResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ApiKeyGuard } from "../auth/guards/api-key.guard";
import { ApiKeyRequest } from "../auth/api-key.entity";
import { FieldError } from "../common/error-response";
import { VehicleCaptureResponseDto } from "./vehicle-captures.docs";
import {
  InvalidVehicleCapturePayloadError,
  toCreateVehicleCaptureInput,
} from "./vehicle-capture-input.mapper";
import { VehicleCapturesService } from "./vehicle-captures.service";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

@ApiTags("Vehicle Captures")
@ApiSecurity("api-key")
@Controller("vehicle-captures")
@UseGuards(ApiKeyGuard)
export class VehicleCapturesController {
  constructor(private readonly vehicleCapturesService: VehicleCapturesService) {}

  @Post()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: MAX_PHOTO_BYTES } }))
  @ApiOperation({
    summary: "Ingest a vehicle-camera photo",
    description:
      "Accepts a raw JPEG photo captured by a vehicle-mounted device, along with its location " +
      "and capture time. The photo is matched to the nearest road segment and queued for " +
      "classification. The classification model does not exist yet — this endpoint only " +
      "receives and stores the photo for later processing.",
  })
  @ApiCreatedResponse({
    type: VehicleCaptureResponseDto,
    description: "Photo accepted, matched to a road segment, and queued.",
  })
  @ApiBadRequestResponse({
    description: "The photo is missing, not a JPEG, or the fields are invalid.",
  })
  @ApiForbiddenResponse({ description: "The authenticated API key source is not 'vehicle'." })
  @ApiNotFoundResponse({ description: "No road segment can be matched to the capture location." })
  @ApiUnauthorizedResponse({ description: "The ingestion API key is missing or invalid." })
  async create(
    @UploadedFile() photo: Express.Multer.File | undefined,
    @Body() body: Record<string, unknown>,
    @Request() req: ApiKeyRequest,
  ) {
    if (req.apiKeySource !== "vehicle") {
      throw new ForbiddenException("API key source does not match capture source");
    }

    if (!photo) {
      throw invalidPayload([{ field: "photo", message: "photo is required" }]);
    }
    if (photo.mimetype !== "image/jpeg") {
      throw invalidPayload([{ field: "photo", message: "photo must be a JPEG image" }]);
    }

    let input;
    try {
      input = toCreateVehicleCaptureInput(body);
    } catch (error: unknown) {
      if (error instanceof InvalidVehicleCapturePayloadError) throw invalidPayload(error.fields);
      throw error;
    }

    const capture = await this.vehicleCapturesService.create(input, photo.buffer);
    return {
      id: capture.id,
      segmentId: capture.segmentId,
      classified: capture.classified,
      createdAt: capture.createdAt,
    };
  }
}

function invalidPayload(fields: FieldError[]): BadRequestException {
  return new BadRequestException({
    message: "Invalid vehicle capture payload.",
    details: { fields },
  });
}
