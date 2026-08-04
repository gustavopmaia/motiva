import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Allow } from "class-validator";
import { READING_CLASSIFICATIONS, ReadingClassification } from "./reading.entity";
import {
  OptionalNumber,
  OptionalString,
  RequiredEnum,
  RequiredNumber,
} from "../common/validation.decorators";

export class IotReadingRequestDto {
  @ApiProperty({
    description: "Reading source identifier for IoT vegetation sensors.",
    enum: ["iot"],
    example: "iot",
  })
  @Allow()
  source!: "iot";

  @ApiProperty({
    description: "Latitude where the reading was captured.",
    example: -23.55052,
  })
  @RequiredNumber()
  lat!: number;

  @ApiProperty({
    description: "Longitude where the reading was captured.",
    example: -46.633308,
  })
  @RequiredNumber()
  lon!: number;

  @ApiProperty({
    description: "Measured vegetation height in centimeters.",
    example: 42,
  })
  @RequiredNumber()
  heightCm!: number;

  @ApiPropertyOptional({
    description: "Optional source confidence from 0 to 1 or 0 to 100.",
    example: 0.92,
  })
  @OptionalNumber()
  confidence?: number;

  @ApiPropertyOptional({
    description: "Optional IoT node identifier copied into reading metadata.",
    example: "node-sp-001",
  })
  @OptionalString()
  nodeId?: string;

  @ApiPropertyOptional({
    description: "Additional source-specific metadata stored with the reading.",
    example: { firmware: "1.4.2", battery: 87 },
  })
  @Allow()
  metadata?: Record<string, unknown>;
}

export class VehicleReadingRequestDto {
  @ApiProperty({
    description: "Reading source identifier for vehicle inspection events.",
    enum: ["vehicle"],
    example: "vehicle",
  })
  @Allow()
  source!: "vehicle";

  @ApiProperty({
    description: "Latitude where the inspection was captured.",
    example: -23.55052,
  })
  @RequiredNumber()
  lat!: number;

  @ApiProperty({
    description: "Longitude where the inspection was captured.",
    example: -46.633308,
  })
  @RequiredNumber()
  lon!: number;

  @ApiProperty({
    description: "Vehicle-side classification for vegetation condition.",
    enum: READING_CLASSIFICATIONS,
    example: "attention",
  })
  @RequiredEnum(READING_CLASSIFICATIONS)
  classification!: ReadingClassification;

  @ApiProperty({
    description: "Confidence for the vehicle classification from 0 to 1 or 0 to 100.",
    example: 0.84,
  })
  @RequiredNumber()
  confidence!: number;

  @ApiPropertyOptional({
    description: "Additional source-specific metadata stored with the reading.",
    example: { vehicleId: "truck-12", camera: "front" },
  })
  @Allow()
  metadata?: Record<string, unknown>;
}

export class SatelliteReadingRequestDto {
  @ApiProperty({
    description: "Reading source identifier for satellite vegetation indexes.",
    enum: ["satellite"],
    example: "satellite",
  })
  @Allow()
  source!: "satellite";

  @ApiProperty({
    description: "Latitude represented by the satellite reading.",
    example: -23.55052,
  })
  @RequiredNumber()
  lat!: number;

  @ApiProperty({
    description: "Longitude represented by the satellite reading.",
    example: -46.633308,
  })
  @RequiredNumber()
  lon!: number;

  @ApiProperty({
    description: "Normalized Difference Vegetation Index used to derive the score.",
    example: 0.64,
  })
  @RequiredNumber()
  ndvi!: number;

  @ApiPropertyOptional({
    description: "Optional source confidence from 0 to 1 or 0 to 100.",
    example: 0.78,
  })
  @OptionalNumber()
  confidence?: number;

  @ApiPropertyOptional({
    description: "Additional source-specific metadata stored with the reading.",
    example: { provider: "sentinel", sceneId: "S2A_20260427_001" },
  })
  @Allow()
  metadata?: Record<string, unknown>;
}

export class ReadingResponseDto {
  @ApiProperty({
    description: "Unique reading identifier.",
    example: "469cc39f-56a3-4a6f-86f9-6d20beab6f19",
  })
  id!: string;

  @ApiProperty({
    description: "Road segment matched to the reading location.",
    example: "883468f1-430b-4532-a789-4be621e56608",
  })
  segmentId!: string;

  @ApiProperty({
    description: "Source that produced the reading.",
    enum: ["iot", "vehicle", "satellite"],
    example: "iot",
  })
  source!: string;

  @ApiProperty({
    description: "Calculated vegetation risk score from 0 to 100.",
    example: 58.8,
  })
  score!: number;

  @ApiProperty({
    description: "Date and time when the reading was persisted.",
    example: "2026-04-27T12:00:00.000Z",
  })
  createdAt!: string;
}
