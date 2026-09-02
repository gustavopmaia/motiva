import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { JwtPayload } from "../auth/jwt-payload";
import { TeamBaseResponseDto } from "./teams.docs";
import { TeamsService } from "./teams.service";

@ApiTags("Teams")
@ApiBearerAuth("jwt")
@Controller("teams")
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @ApiOperation({
    summary: "List team home bases",
    description:
      "Returns team base locations, for plotting on the map. Managers see every active team; " +
      "field users see only their own team.",
  })
  @ApiOkResponse({ type: TeamBaseResponseDto, isArray: true })
  @ApiUnauthorizedResponse({
    description: "The JWT access token is missing, invalid, expired, or cannot be verified.",
  })
  async findAll(@Request() req: { user: JwtPayload }) {
    const scope = await this.teamsService.scopeFor(req.user);
    if (scope.kind === "none") return [];
    if (scope.kind === "team") {
      const team = await this.teamsService.findBaseById(scope.team.id);
      return team ? [team] : [];
    }
    return this.teamsService.findAllActiveBases();
  }
}
