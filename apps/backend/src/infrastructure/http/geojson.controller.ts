import {
  BadRequestException,
  Controller,
  InternalServerErrorException,
  Logger,
  Post,
  UploadedFiles,
  UseInterceptors,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { ProcessGeoJsonUploadUseCase } from "@application/use-cases/process-geojson-upload.use-case";
import { GeoJsonValidationError } from "@domain/geojson-validation.error";

type UploadedFilesPayload = {
  markers?: Array<{ originalname: string; buffer: Buffer }>;
  mowing?: Array<{ originalname: string; buffer: Buffer }>;
};

@Controller({ path: "geojson", version: VERSION_NEUTRAL })
export class GeoJsonController {
  private readonly logger = new Logger(GeoJsonController.name);

  constructor(private readonly processGeoJsonUploadUseCase: ProcessGeoJsonUploadUseCase) {}

  @Post("upload")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "markers", maxCount: 1 },
        { name: "mowing", maxCount: 1 },
      ],
      {
        limits: {
          fileSize: 25 * 1024 * 1024,
          files: 2,
        },
      },
    ),
  )
  async upload(@UploadedFiles() files: UploadedFilesPayload) {
    const markers = files?.markers?.[0];
    const mowing = files?.mowing?.[0];

    if (!markers || !mowing) {
      throw new BadRequestException("Both GeoJSON files are required: markers and mowing.");
    }

    try {
      return await this.processGeoJsonUploadUseCase.execute(markers, mowing);
    } catch (error) {
      if (error instanceof GeoJsonValidationError) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof Error) {
        this.logger.error(error.message, error.stack);
        throw new InternalServerErrorException(error.message);
      }

      this.logger.error("GeoJSON processing failed with an unknown error.");
      throw new InternalServerErrorException("GeoJSON processing failed.");
    }
  }
}
