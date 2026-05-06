import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AlertsService } from "@application/services/alerts.service";
import { AuthService } from "@application/services/auth.service";
import { JwtPayload } from "@application/security/jwt-payload";
import { AlertResponseDto } from "./dto/alerts.docs";
import { JwtAuthGuard } from "./guards/jwt.guard";

@ApiTags("Alerts")
@ApiBearerAuth("jwt")
@Controller("alerts")
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly authService: AuthService,
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
    let territory: { roadName: string; kmStart: number; kmEnd: number } | undefined;

    if (req.user.role === "field") {
      const userTeam = await this.authService.findTeamByUserId(req.user.sub);
      // Field user not assigned to any team sees nothing
      if (!userTeam) return [];
      territory = { roadName: userTeam.roadName, kmStart: userTeam.kmStart, kmEnd: userTeam.kmEnd };
    }

    const result = await this.alertsService.findAll(territory);
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
