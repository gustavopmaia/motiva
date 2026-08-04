import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Request,
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
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { WorkOrdersService } from "./work-orders.service";
import { TeamsService } from "../teams/teams.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { JwtPayload } from "../auth/jwt-payload";
import {
  CreateWorkOrderRequestDto,
  UpdateWorkOrderRequestDto,
  WorkOrderFiltersDto,
  WorkOrderResponseDto,
} from "./work-orders.docs";

@ApiTags("Work orders")
@ApiBearerAuth("jwt")
@Controller("work-orders")
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(
    private readonly workOrdersService: WorkOrdersService,
    private readonly teamsService: TeamsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List work orders",
    description:
      "Returns work orders ordered by creation date. Optional filters can narrow the result by status or assigned team.",
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
  async findAll(@Request() req: { user: JwtPayload }, @Query() filters: WorkOrderFiltersDto) {
    const scope = await this.teamsService.scopeFor(req.user);
    if (scope.kind === "none") return [];

    const workOrders = await this.workOrdersService.findAll(
      scope.kind === "team" ? { ...filters, team: scope.team.name } : filters,
    );
    return workOrders;
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
  async create(@Body() body: CreateWorkOrderRequestDto) {
    return this.workOrdersService.create(body);
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
  async update(
    @Param("id") id: string,
    @Body() body: UpdateWorkOrderRequestDto,
    @Request() req: { user: JwtPayload },
  ) {
    if (req.user.role === "field") {
      if (body.team !== undefined) {
        throw new ForbiddenException("Field users cannot reassign work orders");
      }
      await this.assertFieldUserOwnsWorkOrder(req.user.sub, id);
    }

    return this.workOrdersService.update(id, body);
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
  async complete(@Param("id") id: string, @Request() req: { user: JwtPayload }) {
    if (req.user.role === "field") {
      await this.assertFieldUserOwnsWorkOrder(req.user.sub, id);
    }

    return this.workOrdersService.complete(id);
  }

  private async assertFieldUserOwnsWorkOrder(userId: string, workOrderId: string) {
    const wo = await this.workOrdersService.findById(workOrderId);
    if (!wo) throw new NotFoundException("Work order not found");

    const userTeam = await this.teamsService.findByUserId(userId);
    if (!userTeam || wo.team !== userTeam.name) {
      throw new ForbiddenException("You can only modify work orders assigned to your team");
    }
  }
}
