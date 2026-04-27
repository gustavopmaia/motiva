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
import { WorkOrderStatus, WorkOrderPriority } from "@domain/entities/work-order.entity";
import { WorkOrderRepository } from "@domain/repositories/work-order.repository";
import { CreateWorkOrderUseCase } from "@application/use-cases/create-work-order.use-case";
import { UpdateWorkOrderUseCase } from "@application/use-cases/update-work-order.use-case";
import { CompleteWorkOrderUseCase } from "@application/use-cases/complete-work-order.use-case";
import { InvalidOperationError, NotFoundError } from "@application/errors";
import { JwtAuthGuard } from "@infrastructure/http/guards/jwt.guard";
import { RolesGuard } from "@infrastructure/http/guards/roles.guard";
import { Roles } from "@infrastructure/http/decorators/roles.decorator";

const VALID_STATUSES: WorkOrderStatus[] = ["open", "in_progress", "completed"];
const VALID_PRIORITIES: WorkOrderPriority[] = ["normal", "urgent", "critical"];

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
