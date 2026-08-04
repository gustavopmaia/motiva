import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { RoadSegmentsService } from "./road-segments.service";
import { TeamsService } from "../teams/teams.service";
import { JwtPayload } from "../auth/jwt-payload";
import { RoadSegmentResponseDto } from "./road-segments.docs";

@ApiTags("Road Segments")
@ApiBearerAuth("jwt")
@Controller("road-segments")
@UseGuards(JwtAuthGuard)
export class RoadSegmentsController {
  constructor(
    private readonly roadSegmentsService: RoadSegmentsService,
    private readonly teamsService: TeamsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List road segments",
    description:
      "Returns road segments with their current fused vegetation score. Managers see all segments; field users see only the segments within their team's territory.",
  })
  @ApiOkResponse({ type: [RoadSegmentResponseDto], description: "Array of road segments." })
  @ApiUnauthorizedResponse({ description: "JWT token missing or invalid." })
  async findAll(@Request() req: { user: JwtPayload }) {
    const scope = await this.teamsService.scopeFor(req.user);
    if (scope.kind === "none") return [];

    return this.roadSegmentsService.findAll(scope.kind === "team" ? scope.team : undefined);
  }
}
