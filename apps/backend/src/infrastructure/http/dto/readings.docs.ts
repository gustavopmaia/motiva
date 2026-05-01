import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class IotReadingRequestDto {
  @ApiProperty({
    description: "Reading source identifier for IoT vegetation sensors.",
    enum: ["iot"],
    example: "iot",
  })
  source!: "iot";

  @ApiProperty({
    description: "Latitude where the reading was captured.",
    example: -23.55052,
  })
  lat!: number;

  @ApiProperty({
    description: "Longitude where the reading was captured.",
    example: -46.633308,
  })
  lon!: number;

  @ApiProperty({
    description: "Measured vegetation height in centimeters.",
    example: 42,
  })
  heightCm!: number;

  @ApiPropertyOptional({
    description: "Optional source confidence from 0 to 1 or 0 to 100.",
    example: 0.92,
  })
  confidence?: number;

  @ApiPropertyOptional({
    description: "Optional IoT node identifier copied into reading metadata.",
    example: "node-sp-001",
  })
  nodeId?: string;

  @ApiPropertyOptional({
    description: "Additional source-specific metadata stored with the reading.",
    example: { firmware: "1.4.2", battery: 87 },
  })
  metadata?: Record<string, unknown>;
}

export class VehicleReadingRequestDto {
  @ApiProperty({
    description: "Reading source identifier for vehicle inspection events.",
    enum: ["vehicle"],
    example: "vehicle",
  })
  source!: "vehicle";

  @ApiProperty({
    description: "Latitude where the inspection was captured.",
    example: -23.55052,
  })
  lat!: number;

  @ApiProperty({
    description: "Longitude where the inspection was captured.",
    example: -46.633308,
  })
  lon!: number;

  @ApiProperty({
    description: "Vehicle-side classification for vegetation condition.",
    enum: ["ok", "attention", "urgent"],
    example: "attention",
  })
  classification!: string;

  @ApiProperty({
    description: "Confidence for the vehicle classification from 0 to 1 or 0 to 100.",
    example: 0.84,
  })
  confidence!: number;

  @ApiPropertyOptional({
    description: "Additional source-specific metadata stored with the reading.",
    example: { vehicleId: "truck-12", camera: "front" },
  })
  metadata?: Record<string, unknown>;
}

export class SatelliteReadingRequestDto {
  @ApiProperty({
    description: "Reading source identifier for satellite vegetation indexes.",
    enum: ["satellite"],
    example: "satellite",
  })
  source!: "satellite";

  @ApiProperty({
    description: "Latitude represented by the satellite reading.",
    example: -23.55052,
  })
  lat!: number;

  @ApiProperty({
    description: "Longitude represented by the satellite reading.",
    example: -46.633308,
  })
  lon!: number;

  @ApiProperty({
    description: "Normalized Difference Vegetation Index used to derive the score.",
    example: 0.64,
  })
  ndvi!: number;

  @ApiPropertyOptional({
    description: "Optional source confidence from 0 to 1 or 0 to 100.",
    example: 0.78,
  })
  confidence?: number;

  @ApiPropertyOptional({
    description: "Additional source-specific metadata stored with the reading.",
    example: { provider: "sentinel", sceneId: "S2A_20260427_001" },
  })
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
