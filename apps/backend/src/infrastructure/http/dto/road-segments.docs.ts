import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RoadSegmentResponseDto {
  @ApiProperty({
    description: "Unique identifier of the road segment.",
    example: "4f1a6e8f-6f8a-4d44-9c2a-9e75a6d574df",
  })
  id!: string;

  @ApiProperty({ description: "Name of the road (e.g. BR-101).", example: "BR-101" })
  roadName!: string;

  @ApiProperty({ description: "Start of the segment in kilometres.", example: 0 })
  kmStart!: number;

  @ApiProperty({ description: "End of the segment in kilometres.", example: 1 })
  kmEnd!: number;

  @ApiPropertyOptional({
    description: "Preferred mowing method for this segment.",
    example: "mechanical",
    nullable: true,
  })
  mowingType!: string | null;

  @ApiPropertyOptional({
    description: "Current fused vegetation score (0–100). Null when no readings exist yet.",
    example: 45.5,
    nullable: true,
  })
  scoreCurrent!: number | null;

  @ApiProperty({
    description: "True when sensor readings diverge significantly from each other.",
    example: false,
  })
  scoreDivergent!: boolean;
}
