import { Body, Controller, Get, Param, Patch, Query, Request, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { RoutesService } from "./routes.service";
import { TeamsService } from "../teams/teams.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { JwtPayload } from "../auth/jwt-payload";
import {
  ReorderRouteItemsRequestDto,
  RouteFiltersDto,
  RouteResponseDto,
  UpdateRouteRequestDto,
} from "./routes.docs";

@ApiTags("Routes")
@ApiBearerAuth("jwt")
@Controller("routes")
@UseGuards(JwtAuthGuard)
export class RoutesController {
  constructor(
    private readonly routesService: RoutesService,
    private readonly teamsService: TeamsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List routes",
    description:
      "Returns dispatch routes with their work orders in visit order. Managers see every route; field users see only their own team's routes.",
  })
  @ApiOkResponse({ type: [RouteResponseDto], description: "Routes matching the provided filters." })
  @ApiBadRequestResponse({ description: "One of the filters is invalid." })
  @ApiUnauthorizedResponse({
    description: "The JWT access token is missing, invalid, expired, or cannot be verified.",
  })
  async findAll(@Request() req: { user: JwtPayload }, @Query() filters: RouteFiltersDto) {
    const scope = await this.teamsService.scopeFor(req.user);
    if (scope.kind === "none") return [];

    return this.routesService.findAll(
      scope.kind === "team" ? { ...filters, teamId: scope.team.id } : filters,
    );
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("manager")
  @ApiOperation({
    summary: "Update a route status",
    description:
      "Locks or releases a route. A locked route is never replanned by the dispatch job, so manual changes survive; releasing it back to pending_approval hands the route over to automatic planning again.",
  })
  @ApiParam({ name: "id", description: "Unique route identifier." })
  @ApiBody({ type: UpdateRouteRequestDto, description: "New route status." })
  @ApiOkResponse({ type: RouteResponseDto, description: "Route updated successfully." })
  @ApiBadRequestResponse({ description: "The payload is invalid." })
  @ApiUnauthorizedResponse({
    description: "The JWT access token is missing, invalid, expired, or cannot be verified.",
  })
  @ApiForbiddenResponse({ description: "The authenticated user does not have the manager role." })
  @ApiNotFoundResponse({ description: "No route exists for the provided identifier." })
  async update(@Param("id") id: string, @Body() body: UpdateRouteRequestDto) {
    return this.routesService.updateStatus(id, body.status);
  }

  @Patch(":id/items")
  @UseGuards(RolesGuard)
  @Roles("manager")
  @ApiOperation({
    summary: "Reorder the work orders of a route",
    description:
      "Replaces the visit order of the route. The payload must contain exactly the work orders currently in the route. The route is locked so the dispatch job stops replanning it.",
  })
  @ApiParam({ name: "id", description: "Unique route identifier." })
  @ApiBody({ type: ReorderRouteItemsRequestDto, description: "Work order ids in visit order." })
  @ApiOkResponse({ type: RouteResponseDto, description: "Route reordered and locked." })
  @ApiBadRequestResponse({
    description: "The payload is invalid or does not match the work orders in the route.",
  })
  @ApiUnauthorizedResponse({
    description: "The JWT access token is missing, invalid, expired, or cannot be verified.",
  })
  @ApiForbiddenResponse({ description: "The authenticated user does not have the manager role." })
  @ApiNotFoundResponse({ description: "No route exists for the provided identifier." })
  async reorder(@Param("id") id: string, @Body() body: ReorderRouteItemsRequestDto) {
    return this.routesService.reorder(id, body.workOrderIds);
  }
}
