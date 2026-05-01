import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AlertRepository } from "@domain/repositories/alert.repository";
import { AlertResponseDto } from "./dto/alerts.docs";
import { JwtAuthGuard } from "./guards/jwt.guard";

@ApiTags("Alerts")
@ApiBearerAuth("jwt")
@Controller("alerts")
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(@Inject(AlertRepository) private readonly alertRepository: AlertRepository) {}

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
  async findAll() {
    const alerts = await this.alertRepository.findAll();
    return alerts.map((a) => ({
      id: a.id,
      segmentId: a.segmentId,
      osId: a.osId,
      level: a.level,
      score: a.score,
      createdAt: a.createdAt,
    }));
  }
}
