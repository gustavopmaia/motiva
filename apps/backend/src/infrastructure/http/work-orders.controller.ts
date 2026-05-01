import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { WorkOrderStatus, WorkOrderPriority, WorkOrder } from "@domain/entities/work-order.entity";
import { WorkOrdersService } from "@application/services/work-orders.service";
import { JwtAuthGuard } from "@infrastructure/http/guards/jwt.guard";
import { RolesGuard } from "@infrastructure/http/guards/roles.guard";
import { Roles } from "@infrastructure/http/decorators/roles.decorator";
import {
  CreateWorkOrderRequestDto,
  UpdateWorkOrderRequestDto,
  WorkOrderResponseDto,
} from "./dto/work-orders.docs";

const VALID_STATUSES: WorkOrderStatus[] = ["open", "in_progress", "completed"];
const VALID_PRIORITIES: WorkOrderPriority[] = ["attention", "urgent", "critical"];

@ApiTags("Work orders")
@ApiBearerAuth("jwt")
@Controller("work-orders")
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Get()
  @ApiOperation({
    summary: "List work orders",
    description:
      "Returns work orders ordered by creation date. Optional filters can narrow the result by status or assigned team.",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: VALID_STATUSES,
    description: "Optional lifecycle status used to filter work orders.",
  })
  @ApiQuery({
    name: "team",
    required: false,
    description: "Optional field team name used to filter work orders.",
    example: "North maintenance crew",
  })
  @ApiOkResponse({
    type: WorkOrderResponseDto,
    isArray: true,
    description: "Work orders matching the provided filters.",
  })
  @ApiBadRequestResponse({ description: "The status filter is not one of the supported values." })
  @ApiUnauthorizedResponse({
    description: "The JWT access token is missing, invalid, expired, or cannot be verified.",
  })
  async findAll(@Query("status") status?: string, @Query("team") team?: string) {
    const filters = parseWorkOrderFilters(status, team);
    const workOrders = await this.workOrdersService.findAll(filters);
    return workOrders.map(this.toResponse);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("manager")
  @ApiOperation({
    summary: "Create a work order",
    description:
      "Creates a manual work order for a road segment and alert. Only manager users can create work orders directly.",
  })
  @ApiBody({ type: CreateWorkOrderRequestDto, description: "Work order creation payload." })
  @ApiCreatedResponse({
    type: WorkOrderResponseDto,
    description: "Work order created successfully.",
  })
  @ApiBadRequestResponse({
    description: "Required fields are missing or one of the values is invalid.",
  })
  @ApiUnauthorizedResponse({
    description: "The JWT access token is missing, invalid, expired, or cannot be verified.",
  })
  @ApiForbiddenResponse({
    description: "The authenticated user does not have the manager role.",
  })
  async create(@Body() body: Record<string, unknown>) {
    const wo = await this.workOrdersService.create(parseCreateWorkOrderBody(body));
    return this.toResponse(wo);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update a work order",
    description:
      "Updates mutable work order fields. Completed work orders cannot be updated through this endpoint.",
  })
  @ApiParam({
    name: "id",
    description: "Unique work order identifier.",
    example: "a5863a41-16a8-4121-aee1-d6c5b326b779",
  })
  @ApiBody({ type: UpdateWorkOrderRequestDto, description: "Fields to update on the work order." })
  @ApiOkResponse({ type: WorkOrderResponseDto, description: "Work order updated successfully." })
  @ApiBadRequestResponse({
    description: "The payload is invalid or the work order cannot be updated in its current state.",
  })
  @ApiUnauthorizedResponse({
    description: "The JWT access token is missing, invalid, expired, or cannot be verified.",
  })
  @ApiNotFoundResponse({ description: "No work order exists for the provided identifier." })
  async update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    const wo = await this.workOrdersService.update(id, parseUpdateWorkOrderBody(body));
    return this.toResponse(wo);
  }

  @Post(":id/complete")
  @ApiOperation({
    summary: "Complete a work order",
    description:
      "Marks a work order as completed and resets the associated road segment score and divergence flag.",
  })
  @ApiParam({
    name: "id",
    description: "Unique work order identifier.",
    example: "a5863a41-16a8-4121-aee1-d6c5b326b779",
  })
  @ApiOkResponse({ type: WorkOrderResponseDto, description: "Work order completed successfully." })
  @ApiBadRequestResponse({
    description: "The work order is already completed or cannot be completed.",
  })
  @ApiUnauthorizedResponse({
    description: "The JWT access token is missing, invalid, expired, or cannot be verified.",
  })
  @ApiNotFoundResponse({ description: "No work order exists for the provided identifier." })
  async complete(@Param("id") id: string) {
    const wo = await this.workOrdersService.complete(id);
    return this.toResponse(wo);
  }

  private toResponse(wo: WorkOrder) {
    return {
      id: wo.id,
      segmentId: wo.segmentId,
      alertId: wo.alertId,
      status: wo.status,
      priority: wo.priority,
      scoreAtCreation: wo.scoreAtCreation,
      team: wo.team,
      observation: wo.observation,
      createdAt: wo.createdAt,
      startedAt: wo.startedAt,
      completedAt: wo.completedAt,
    };
  }
}

function parseWorkOrderFilters(status?: string, team?: string) {
  if (status !== undefined && !VALID_STATUSES.includes(status as WorkOrderStatus)) {
    throw new BadRequestException({
      message: "Invalid work order filters.",
      details: { fields: [{ field: "status", message: "status filter is invalid" }] },
    });
  }

  return {
    status: status as WorkOrderStatus | undefined,
    team,
  };
}

function parseCreateWorkOrderBody(body: Record<string, unknown>) {
  const { segmentId, alertId, priority, scoreAtCreation, team, observation } = body;
  const fields: { field: string; message: string }[] = [];

  if (typeof segmentId !== "string" || !segmentId) {
    fields.push({ field: "segmentId", message: "segmentId is required" });
  }
  if (typeof alertId !== "string" || !alertId) {
    fields.push({ field: "alertId", message: "alertId is required" });
  }
  if (!VALID_PRIORITIES.includes(priority as WorkOrderPriority)) {
    fields.push({ field: "priority", message: "priority must be attention, urgent, or critical" });
  }

  const score = Number(scoreAtCreation);
  if (!Number.isFinite(score)) {
    fields.push({ field: "scoreAtCreation", message: "scoreAtCreation must be a number" });
  }

  if (fields.length > 0) {
    throw new BadRequestException({
      message: "Invalid work order payload.",
      details: { fields },
    });
  }

  return {
    segmentId: segmentId as string,
    alertId: alertId as string,
    priority: priority as WorkOrderPriority,
    scoreAtCreation: score,
    team: typeof team === "string" ? team : null,
    observation: typeof observation === "string" ? observation : null,
  };
}

function parseUpdateWorkOrderBody(body: Record<string, unknown>) {
  const { status, team, observation } = body;
  if (status !== undefined && !VALID_STATUSES.includes(status as WorkOrderStatus)) {
    throw new BadRequestException({
      message: "Invalid work order payload.",
      details: { fields: [{ field: "status", message: "status is invalid" }] },
    });
  }

  return {
    status: status as WorkOrderStatus | undefined,
    team: team !== undefined ? (team === null ? null : String(team)) : undefined,
    observation:
      observation !== undefined ? (observation === null ? null : String(observation)) : undefined,
  };
}
