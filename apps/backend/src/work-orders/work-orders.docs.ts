import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import {
  PATCHABLE_WORK_ORDER_STATUSES,
  WORK_ORDER_LOCATIONS,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WorkOrderLocation,
  WorkOrderPriority,
  WorkOrderStatus,
} from "./work-order.entity";
import {
  OptionalString,
  RequiredEnum,
  RequiredNumber,
  RequiredString,
} from "../common/validation.decorators";

export class WorkOrderFiltersDto {
  static readonly validationMessage = "Invalid work order filters.";

  @ApiPropertyOptional({
    description: "Optional lifecycle status used to filter work orders.",
    enum: WORK_ORDER_STATUSES,
  })
  @IsOptional()
  @IsIn(WORK_ORDER_STATUSES, { message: "status filter is invalid" })
  status?: WorkOrderStatus;

  @ApiPropertyOptional({
    description: "Optional field team name used to filter work orders.",
    example: "North maintenance crew",
  })
  @IsOptional()
  @IsString({ message: "team filter is invalid" })
  team?: string;
}

export class CreateWorkOrderRequestDto {
  static readonly validationMessage = "Invalid work order payload.";

  @ApiProperty({
    description: "Road segment that needs field work.",
    example: "883468f1-430b-4532-a789-4be621e56608",
  })
  @RequiredString()
  segmentId!: string;

  @ApiProperty({
    description: "Alert that originated the work order.",
    example: "f0acdd55-5f75-4d72-acf5-ecba73d6a5de",
  })
  @RequiredString()
  alertId!: string;

  @ApiProperty({
    description: "Operational priority assigned to the work order.",
    enum: WORK_ORDER_PRIORITIES,
    example: "urgent",
  })
  @RequiredEnum(WORK_ORDER_PRIORITIES)
  priority!: WorkOrderPriority;

  @ApiProperty({
    description: "Road segment score at the moment the work order was created.",
    example: 74.5,
  })
  @RequiredNumber()
  scoreAtCreation!: number;

  @ApiPropertyOptional({
    description: "Field team assigned to the work order.",
    example: "North maintenance crew",
  })
  @OptionalString()
  team?: string | null;

  @ApiPropertyOptional({
    description: "Operational note or observation for the field team.",
    example: "Vegetation is close to the shoulder near km 42.",
  })
  @OptionalString()
  observation?: string | null;

  @ApiPropertyOptional({
    description: "Location within the right-of-way where the service was performed.",
    enum: WORK_ORDER_LOCATIONS,
    example: "faixa_1",
  })
  @IsOptional()
  @IsIn(WORK_ORDER_LOCATIONS, { message: "location is invalid" })
  location?: WorkOrderLocation | null;
}

export class UpdateWorkOrderRequestDto {
  static readonly validationMessage = "Invalid work order payload.";

  @ApiPropertyOptional({
    description: "New lifecycle status for the work order. Use POST /:id/complete to complete one.",
    enum: PATCHABLE_WORK_ORDER_STATUSES,
    example: "in_progress",
  })
  @IsOptional()
  @IsIn(PATCHABLE_WORK_ORDER_STATUSES, {
    message: "status must be open or in_progress; use POST /:id/complete to complete a work order",
  })
  status?: WorkOrderStatus;

  @ApiPropertyOptional({
    description: "Field team assigned to the work order. Send null to clear it.",
    example: "North maintenance crew",
  })
  @OptionalString()
  team?: string | null;

  @ApiPropertyOptional({
    description: "Operational note or observation. Send null to clear it.",
    example: "Crew scheduled for tomorrow morning.",
  })
  @OptionalString()
  observation?: string | null;

  @ApiPropertyOptional({
    description:
      "Location within the right-of-way where the service was performed. Send null to clear it.",
    enum: WORK_ORDER_LOCATIONS,
    example: "faixa_1",
  })
  @IsOptional()
  @IsIn(WORK_ORDER_LOCATIONS, { message: "location is invalid" })
  location?: WorkOrderLocation | null;
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
    description: "Location within the right-of-way where the service was performed.",
    enum: WORK_ORDER_LOCATIONS,
    nullable: true,
    example: "faixa_1",
  })
  location!: string | null;

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
