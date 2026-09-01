import { Controller, Get, Query, Request, Res, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { JwtPayload } from "../auth/jwt-payload";
import {
  AnnualReportQueryDto,
  GeneratedReportResponseDto,
  MonthlyReportQueryDto,
} from "./reports.docs";
import { ANTT_ANNUAL_CONTEXT, ARTESP_MONTHLY_CONTEXT, ReportsService } from "./reports.service";

@ApiTags("Reports")
@ApiBearerAuth("jwt")
@Controller("reports")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("manager")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("monthly")
  @ApiOperation({
    summary: "Generate the ARTESP monthly conservation report",
    description:
      "Generates a report of completed work orders for the given month, grouped by road " +
      "segment, in the format expected for delivery to ARTESP (Anexo 06). Accepts ?format=pdf " +
      "(default) or ?format=csv.",
  })
  @ApiOkResponse({ description: "Report generated." })
  @ApiForbiddenResponse({ description: "The authenticated user does not have the manager role." })
  async monthly(
    @Query() query: MonthlyReportQueryDto,
    @Request() req: { user: JwtPayload },
    @Res() res: Response,
  ) {
    const rows = await this.reportsService.monthlyRows(query.month, query.roadName);
    const format = query.format ?? "pdf";

    await this.reportsService.recordGeneration({
      reportType: "artesp_monthly",
      period: query.month,
      format,
      roadName: query.roadName ?? null,
      userId: req.user.sub,
    });

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="relatorio-mensal-${query.month}.csv"`,
      );
      res.send(this.reportsService.renderCsv(rows));
      return;
    }

    const doc = this.reportsService.renderPdf(ARTESP_MONTHLY_CONTEXT(query.month), rows);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="relatorio-mensal-${query.month}.pdf"`,
    );
    doc.pipe(res);
  }

  @Get("annual")
  @ApiOperation({
    summary: "Generate the ANTT annual monitoring report (partial)",
    description:
      "Generates the subset of the ANTT annual monitoring report (PER item 3.3.6/4.2.6) that " +
      "this system actually tracks: vegetation-conservation work orders completed in the given " +
      "year. Does not cover land-occupation records, tree-risk assessment, or external Verificador " +
      "validation. Accepts ?format=pdf (default) or ?format=csv.",
  })
  @ApiOkResponse({ description: "Report generated." })
  @ApiForbiddenResponse({ description: "The authenticated user does not have the manager role." })
  async annual(
    @Query() query: AnnualReportQueryDto,
    @Request() req: { user: JwtPayload },
    @Res() res: Response,
  ) {
    const rows = await this.reportsService.annualRows(query.year, query.roadName);
    const format = query.format ?? "pdf";

    await this.reportsService.recordGeneration({
      reportType: "antt_annual",
      period: query.year,
      format,
      roadName: query.roadName ?? null,
      userId: req.user.sub,
    });

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="relatorio-anual-${query.year}.csv"`,
      );
      res.send(this.reportsService.renderCsv(rows));
      return;
    }

    const doc = this.reportsService.renderPdf(ANTT_ANNUAL_CONTEXT(query.year), rows);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="relatorio-anual-${query.year}.pdf"`,
    );
    doc.pipe(res);
  }

  @Get("generated")
  @ApiOperation({
    summary: "List report generation history",
    description:
      "Audit trail of every report generated (monthly or annual, pdf or csv), newest first — " +
      "evidence that a report was pulled within the ARTESP submission deadline.",
  })
  @ApiOkResponse({ type: GeneratedReportResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: "The authenticated user does not have the manager role." })
  async generated() {
    return this.reportsService.listGenerated();
  }
}
