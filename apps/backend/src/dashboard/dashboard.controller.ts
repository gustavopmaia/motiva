import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { DashboardSummaryResponseDto } from "./dashboard.docs";
import { DashboardService } from "./dashboard.service";

@ApiTags("Dashboard")
@ApiBearerAuth("jwt")
@Controller("dashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("manager")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  @ApiOperation({
    summary: "Get the operational summary",
    description:
      "Aggregates score da malha, evidencia fotografica dos ultimos 30 dias, OS por prioridade " +
      "e status, e historico de relatorios — visao rapida pra gestao, sem repetir chamadas.",
  })
  @ApiOkResponse({ type: DashboardSummaryResponseDto })
  async summary() {
    return this.dashboardService.getSummary();
  }
}
