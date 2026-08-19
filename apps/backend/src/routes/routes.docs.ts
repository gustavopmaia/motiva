import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from "class-validator";
import { ROUTE_STATUSES, RouteStatus } from "./route.entity";
import { WORK_ORDER_PRIORITIES, WORK_ORDER_STATUSES } from "../work-orders/work-order.entity";
import { OptionalString, RequiredEnum } from "../common/validation.decorators";

export class RouteFiltersDto {
  static readonly validationMessage = "Invalid route filters.";

  @ApiPropertyOptional({
    description: "Optional route status used to filter routes.",
    enum: ROUTE_STATUSES,
  })
  @IsOptional()
  @IsIn(ROUTE_STATUSES, { message: "status filter is invalid" })
  status?: RouteStatus;

  @ApiPropertyOptional({
    description: "Optional planned date used to filter routes, as YYYY-MM-DD.",
    example: "2026-08-07",
  })
  @OptionalString({ trim: true })
  date?: string;
}

export class UpdateRouteRequestDto {
  static readonly validationMessage = "Invalid route payload.";

  @ApiProperty({
    description:
      "New route status. A locked route is never replanned by the dispatch job; a pending_approval route is rebuilt on the next run.",
    enum: ROUTE_STATUSES,
    example: "locked",
  })
  @RequiredEnum(ROUTE_STATUSES)
  status!: RouteStatus;
}

export class ReorderRouteItemsRequestDto {
  static readonly validationMessage = "Invalid route items payload.";

  @ApiProperty({
    description:
      "Work order identifiers in the desired visit order. Must contain exactly the work orders currently in the route. Reordering locks the route.",
    type: [String],
    example: ["a5863a41-16a8-4121-aee1-d6c5b326b779", "b1f4e2c8-9a3d-4f21-8c77-2e5b9d0a1c43"],
  })
  @IsArray({ message: "workOrderIds must be an array" })
  @ArrayNotEmpty({ message: "workOrderIds is required" })
  @IsString({ each: true, message: "workOrderIds must contain strings" })
  workOrderIds!: string[];
}

export class RouteItemResponseDto {
  @ApiProperty({ description: "Work order scheduled in this route position." })
  workOrderId!: string;

  @ApiProperty({ description: "Zero-based visit order within the route.", example: 0 })
  orderIndex!: number;

  @ApiProperty({ description: "Current work order status.", enum: WORK_ORDER_STATUSES })
  workOrderStatus!: string;

  @ApiProperty({ description: "Work order priority.", enum: WORK_ORDER_PRIORITIES })
  priority!: string;

  @ApiProperty({ description: "Operational note on the work order.", nullable: true })
  observation!: string | null;

  @ApiProperty({ description: "Road segment to be serviced." })
  segmentId!: string;

  @ApiProperty({ description: "Road the segment belongs to.", example: "BR-101" })
  roadName!: string;

  @ApiProperty({ description: "Segment start kilometer.", example: 10.5 })
  kmStart!: number;

  @ApiProperty({ description: "Segment end kilometer.", example: 11.2 })
  kmEnd!: number;

  @ApiProperty({ description: "Latest fused vegetation score.", nullable: true, example: 72.4 })
  scoreCurrent!: number | null;

  @ApiProperty({
    description: "Latitude of the segment start, to place the stop on the map.",
    nullable: true,
    example: -23.4162,
  })
  lat!: number | null;

  @ApiProperty({
    description: "Longitude of the segment start, to place the stop on the map.",
    nullable: true,
    example: -46.7841,
  })
  lon!: number | null;
}

export class RouteResponseDto {
  @ApiProperty({ description: "Unique route identifier." })
  id!: string;

  @ApiProperty({ description: "Team responsible for the route." })
  teamId!: string;

  @ApiProperty({ description: "Team name.", example: "Equipe Norte" })
  teamName!: string;

  @ApiProperty({ description: "Planned date, as YYYY-MM-DD.", example: "2026-08-07" })
  date!: string;

  @ApiProperty({ description: "Route status.", enum: ROUTE_STATUSES })
  status!: string;

  @ApiProperty({ description: "Creation timestamp." })
  createdAt!: Date;

  @ApiProperty({ description: "Work orders in visit order.", type: [RouteItemResponseDto] })
  items!: RouteItemResponseDto[];
}
