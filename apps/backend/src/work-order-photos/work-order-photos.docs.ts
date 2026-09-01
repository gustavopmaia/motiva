import { ApiProperty } from "@nestjs/swagger";
import { IsDateString } from "class-validator";
import { RequiredNumber } from "../common/validation.decorators";
import { WORK_ORDER_PHOTO_VALIDATION_STATUSES } from "./work-order-photo.entity";

export class WorkOrderPhotoRequestDto {
  static readonly validationMessage = "Invalid work order photo payload.";

  @ApiProperty({
    description: "Latitude where the photo was captured, as reported by the field app.",
    example: -23.55052,
  })
  @RequiredNumber()
  lat!: number;

  @ApiProperty({
    description: "Longitude where the photo was captured, as reported by the field app.",
    example: -46.633308,
  })
  @RequiredNumber()
  lon!: number;

  @ApiProperty({
    description: "When the field app captured the photo (ISO-8601).",
    example: "2026-08-28T14:32:07.000Z",
  })
  @IsDateString({}, { message: "capturedAt must be an ISO-8601 date string" })
  capturedAt!: string;
}

export class WorkOrderPhotoResponseDto {
  @ApiProperty({
    description: "Unique work order photo identifier.",
    example: "6c1a2e1a-9e3d-4c9b-8a2a-5a2f2f0b7c31",
  })
  id!: string;

  @ApiProperty({
    description: "SHA-256 hex digest of the stored photo file, for integrity verification.",
    example: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  })
  photoHash!: string;

  @ApiProperty({
    description:
      "Result of comparing the photo's EXIF metadata (GPS and timestamp) against the location " +
      "and time reported by the field app. Does not block completion; flags the work order for review.",
    enum: WORK_ORDER_PHOTO_VALIDATION_STATUSES,
    example: "verified",
  })
  validationStatus!: string;

  @ApiProperty({
    description: "Distance in meters between the reported location and the photo's EXIF GPS data.",
    nullable: true,
    example: 4.2,
  })
  distanceMeters!: number | null;

  @ApiProperty({
    description: "Difference in seconds between the reported capture time and the EXIF timestamp.",
    nullable: true,
    example: 5,
  })
  timeDiffSeconds!: number | null;

  @ApiProperty({
    description: "Date and time when the photo was received.",
    example: "2026-08-28T14:32:10.000Z",
  })
  createdAt!: string;
}
