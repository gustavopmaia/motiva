import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateWorkOrderRequestDto {
  @ApiProperty({
    description: "Road segment that needs field work.",
    example: "883468f1-430b-4532-a789-4be621e56608",
  })
  segmentId!: string;

  @ApiProperty({
    description: "Alert that originated the work order.",
    example: "f0acdd55-5f75-4d72-acf5-ecba73d6a5de",
  })
  alertId!: string;

  @ApiProperty({
    description: "Operational priority assigned to the work order.",
    enum: ["attention", "urgent", "critical"],
    example: "urgent",
  })
  priority!: string;

  @ApiProperty({
    description: "Road segment score at the moment the work order was created.",
    example: 74.5,
  })
  scoreAtCreation!: number;

  @ApiPropertyOptional({
    description: "Field team assigned to the work order.",
    example: "North maintenance crew",
  })
  team?: string | null;

  @ApiPropertyOptional({
    description: "Operational note or observation for the field team.",
    example: "Vegetation is close to the shoulder near km 42.",
  })
  observation?: string | null;
}

export class UpdateWorkOrderRequestDto {
  @ApiPropertyOptional({
    description: "New lifecycle status for the work order.",
    enum: ["open", "in_progress", "completed"],
    example: "in_progress",
  })
  status?: string;

  @ApiPropertyOptional({
    description: "Field team assigned to the work order. Send null to clear it.",
    example: "North maintenance crew",
  })
  team?: string | null;

  @ApiPropertyOptional({
    description: "Operational note or observation. Send null to clear it.",
    example: "Crew scheduled for tomorrow morning.",
  })
  observation?: string | null;
}

export class WorkOrderResponseDto {
  @ApiProperty({
    description: "Unique work order identifier.",
    example: "a5863a41-16a8-4121-aee1-d6c5b326b779",
  })
  id!: string;

  @ApiProperty({
    description: "Road segment associated with the work order.",
    example: "883468f1-430b-4532-a789-4be621e56608",
  })
  segmentId!: string;

  @ApiProperty({
    description: "Alert associated with the work order.",
    example: "f0acdd55-5f75-4d72-acf5-ecba73d6a5de",
  })
  alertId!: string;

  @ApiProperty({
    description: "Current lifecycle status for the work order.",
    enum: ["open", "in_progress", "completed"],
    example: "open",
  })
  status!: string;

  @ApiProperty({
    description: "Operational priority assigned to the work order.",
    enum: ["attention", "urgent", "critical"],
    example: "urgent",
  })
  priority!: string;

  @ApiProperty({
    description: "Road segment score captured when the work order was created.",
    example: 74.5,
  })
  scoreAtCreation!: number;

  @ApiProperty({
    description: "Field team assigned to the work order.",
    nullable: true,
    example: "North maintenance crew",
  })
  team!: string | null;

  @ApiProperty({
    description: "Operational note or observation for the field team.",
    nullable: true,
    example: "Vegetation is close to the shoulder near km 42.",
  })
  observation!: string | null;

  @ApiProperty({
    description: "Date and time when the work order was created.",
    example: "2026-04-27T12:00:00.000Z",
  })
  createdAt!: string;

  @ApiProperty({
    description: "Date and time when the work order moved to in progress.",
    nullable: true,
    example: null,
  })
  startedAt!: string | null;

  @ApiProperty({
    description: "Date and time when the work order was completed.",
    nullable: true,
    example: null,
  })
  completedAt!: string | null;
}
