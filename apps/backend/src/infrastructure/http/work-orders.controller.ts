import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { WorkOrderStatus, WorkOrderPriority } from "@domain/entities/work-order.entity";
import { WorkOrderRepository } from "@domain/repositories/work-order.repository";
import { CreateWorkOrderUseCase } from "@application/use-cases/create-work-order.use-case";
import { UpdateWorkOrderUseCase } from "@application/use-cases/update-work-order.use-case";
import { CompleteWorkOrderUseCase } from "@application/use-cases/complete-work-order.use-case";
import { InvalidOperationError, NotFoundError } from "@application/errors";
import { JwtAuthGuard } from "@infrastructure/http/guards/jwt.guard";
import { RolesGuard } from "@infrastructure/http/guards/roles.guard";
import { Roles } from "@infrastructure/http/decorators/roles.decorator";
import {
  CreateWorkOrderRequestDto,
  UpdateWorkOrderRequestDto,
  WorkOrderResponseDto,
} from "./dto/work-orders.docs";

const VALID_STATUSES: WorkOrderStatus[] = ["open", "in_progress", "completed"];
const VALID_PRIORITIES: WorkOrderPriority[] = ["normal", "urgent", "critical"];

@ApiTags("Work orders")
@ApiBearerAuth("jwt")
@Controller("work-orders")
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(
    private readonly workOrderRepository: WorkOrderRepository,
    private readonly createWorkOrder: CreateWorkOrderUseCase,
    private readonly updateWorkOrder: UpdateWorkOrderUseCase,
    private readonly completeWorkOrder: CompleteWorkOrderUseCase,
  ) {}

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
    if (status !== undefined && !VALID_STATUSES.includes(status as WorkOrderStatus)) {
      throw new BadRequestException("Invalid status filter");
    }
    return this.workOrderRepository.findAll({
      status: status as WorkOrderStatus | undefined,
      team,
    });
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
    const { segmentId, alertId, priority, scoreAtCreation, team, observation } = body;

    if (typeof segmentId !== "string" || !segmentId) {
      throw new BadRequestException("segmentId is required");
    }
    if (typeof alertId !== "string" || !alertId) {
      throw new BadRequestException("alertId is required");
    }
    if (!VALID_PRIORITIES.includes(priority as WorkOrderPriority)) {
      throw new BadRequestException("priority must be normal, urgent, or critical");
    }
    const score = Number(scoreAtCreation);
    if (!Number.isFinite(score)) {
      throw new BadRequestException("scoreAtCreation must be a number");
    }

    return this.createWorkOrder.execute({
      segmentId,
      alertId,
      priority: priority as WorkOrderPriority,
      scoreAtCreation: score,
      team: typeof team === "string" ? team : null,
      observation: typeof observation === "string" ? observation : null,
    });
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
    const { status, team, observation } = body;

    if (status !== undefined && !VALID_STATUSES.includes(status as WorkOrderStatus)) {
      throw new BadRequestException("Invalid status");
    }

    try {
      return await this.updateWorkOrder.execute(id, {
        status: status as WorkOrderStatus | undefined,
        team: team !== undefined ? (team === null ? null : String(team)) : undefined,
        observation:
          observation !== undefined
            ? observation === null
              ? null
              : String(observation)
            : undefined,
      });
    } catch (error: unknown) {
      if (error instanceof NotFoundError) throw new NotFoundException(error.message);
      if (error instanceof InvalidOperationError) throw new BadRequestException(error.message);
      throw new BadRequestException(error instanceof Error ? error.message : "Update failed");
    }
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
    try {
      return await this.completeWorkOrder.execute(id);
    } catch (error: unknown) {
      if (error instanceof NotFoundError) throw new NotFoundException(error.message);
      if (error instanceof InvalidOperationError) throw new BadRequestException(error.message);
      throw new BadRequestException(error instanceof Error ? error.message : "Completion failed");
    }
  }
}
