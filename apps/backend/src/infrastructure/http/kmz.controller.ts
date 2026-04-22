import {
  BadRequestException,
  Controller,
  InternalServerErrorException,
  Post,
  UploadedFiles,
  UseInterceptors,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { KmzValidationError } from "@domain/kmz-validation.error";
import { ProcessKmzUploadUseCase } from "@application/use-cases/process-kmz-upload.use-case";

type UploadedFilesPayload = {
  markers?: Array<{ originalname: string; buffer: Buffer }>;
  mowing?: Array<{ originalname: string; buffer: Buffer }>;
};

@Controller({ path: "kmz", version: VERSION_NEUTRAL })
export class KmzController {
  constructor(private readonly processKmzUploadUseCase: ProcessKmzUploadUseCase) {}

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
      throw new BadRequestException("Both KMZ files are required: markers and mowing.");
    }

    try {
      return await this.processKmzUploadUseCase.execute(markers, mowing);
    } catch (error) {
      if (error instanceof KmzValidationError) {
        throw new BadRequestException(error.message);
      }
      throw new InternalServerErrorException("KMZ processing failed.");
    }
  }
}
