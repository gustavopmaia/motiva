import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AlertsService } from "./alerts.service";
import { TeamsService } from "../teams/teams.service";
import { JwtPayload } from "../auth/jwt-payload";
import { AlertResponseDto } from "./alerts.docs";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";

@ApiTags("Alerts")
@ApiBearerAuth("jwt")
@Controller("alerts")
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly teamsService: TeamsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List alerts",
    description: "Returns alerts ordered by creation date, with the newest alerts first.",
  })
  @ApiOkResponse({
    type: AlertResponseDto,
    isArray: true,
    description: "Alerts currently stored by the backend.",
  })
  @ApiUnauthorizedResponse({
    description: "The JWT access token is missing, invalid, expired, or cannot be verified.",
  })
  async findAll(@Request() req: { user: JwtPayload }) {
    const scope = await this.teamsService.scopeFor(req.user);
    if (scope.kind === "none") return [];

    const result = await this.alertsService.findAll(scope.kind === "team" ? scope.team : undefined);
    return result.map((a) => ({
      id: a.id,
      segmentId: a.segmentId,
      osId: a.osId,
      level: a.level,
      score: a.score,
      createdAt: a.createdAt,
      closedAt: a.closedAt,
    }));
  }
}
