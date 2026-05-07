import { ApiProperty } from "@nestjs/swagger";

export class AlertResponseDto {
  @ApiProperty({
    description: "Unique alert identifier.",
    example: "f0acdd55-5f75-4d72-acf5-ecba73d6a5de",
  })
  id!: string;

  @ApiProperty({
    description: "Road segment where the alert was opened.",
    example: "883468f1-430b-4532-a789-4be621e56608",
  })
  segmentId!: string;

  @ApiProperty({
    description: "External service order identifier when one exists.",
    nullable: true,
    example: null,
  })
  osId!: string | null;

  @ApiProperty({
    description: "Alert level derived from the segment score.",
    enum: ["attention", "urgent", "critical"],
    example: "urgent",
  })
  level!: string;

  @ApiProperty({
    description: "Segment score that triggered the alert.",
    example: 74.5,
  })
  score!: number;

  @ApiProperty({
    description: "Date and time when the alert was created.",
    example: "2026-04-27T12:00:00.000Z",
  })
  createdAt!: string;
}
