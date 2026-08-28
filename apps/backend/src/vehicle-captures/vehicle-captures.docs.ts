import { ApiProperty } from "@nestjs/swagger";
import { IsDateString } from "class-validator";
import { RequiredNumber } from "../common/validation.decorators";

export class VehicleCaptureRequestDto {
  @ApiProperty({
    description: "Latitude where the photo was captured.",
    example: -23.55052,
  })
  @RequiredNumber()
  lat!: number;

  @ApiProperty({
    description: "Longitude where the photo was captured.",
    example: -46.633308,
  })
  @RequiredNumber()
  lon!: number;

  @ApiProperty({
    description: "When the phone captured the photo (ISO-8601).",
    example: "2026-08-28T14:32:07.000Z",
  })
  @IsDateString({}, { message: "capturedAt must be an ISO-8601 date string" })
  capturedAt!: string;
}

export class VehicleCaptureResponseDto {
  @ApiProperty({
    description: "Unique capture identifier.",
    example: "469cc39f-56a3-4a6f-86f9-6d20beab6f19",
  })
  id!: string;

  @ApiProperty({
    description: "Road segment matched to the capture location.",
    example: "883468f1-430b-4532-a789-4be621e56608",
  })
  segmentId!: string;

  @ApiProperty({
    description: "Whether the photo has already been classified.",
    example: false,
  })
  classified!: boolean;

  @ApiProperty({
    description: "Date and time when the capture was received.",
    example: "2026-08-28T14:32:10.000Z",
  })
  createdAt!: string;
}
