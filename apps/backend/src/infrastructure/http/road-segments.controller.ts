import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "@infrastructure/http/guards/jwt.guard";
import { RoadSegmentsService } from "@application/services/road-segments.service";
import { AuthService } from "@application/services/auth.service";
import { JwtPayload } from "@application/security/jwt-payload";
import { RoadSegmentResponseDto } from "./dto/road-segments.docs";

@ApiTags("Road Segments")
@Controller("road-segments")
@UseGuards(JwtAuthGuard)
export class RoadSegmentsController {
  constructor(
    private readonly roadSegmentsService: RoadSegmentsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @ApiBearerAuth("jwt")
  @ApiOperation({
    summary: "List road segments",
    description:
      "Returns road segments with their current fused vegetation score. Managers see all segments; field users see only the segments within their team's territory.",
  })
  @ApiOkResponse({ type: [RoadSegmentResponseDto], description: "Array of road segments." })
  @ApiUnauthorizedResponse({ description: "JWT token missing or invalid." })
  async findAll(@Request() req: { user: JwtPayload }) {
    let territory: { roadName: string; kmStart: number; kmEnd: number } | undefined;

    if (req.user.role === "field") {
      const userTeam = await this.authService.findTeamByUserId(req.user.sub);
      // Field user not assigned to any team sees nothing
      if (!userTeam) return [];
      territory = { roadName: userTeam.roadName, kmStart: userTeam.kmStart, kmEnd: userTeam.kmEnd };
    }

    const segments = await this.roadSegmentsService.findAll(territory);
    return segments.map((s) => ({
      id: s.id,
      roadName: s.roadName,
      kmStart: s.kmStart,
      kmEnd: s.kmEnd,
      mowingType: s.mowingType,
      scoreCurrent: s.scoreCurrent,
      scoreDivergent: s.scoreDivergent,
    }));
  }
}
