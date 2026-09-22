import { Injectable } from "@nestjs/common";
import { Writable } from "stream";
import { DrizzleService } from "../database/drizzle.service";
import { ObjectStorage } from "../platform/storage/object-storage";
import { ReportRenderer } from "../modules/reporting/infrastructure/report-renderer";
import { DrizzleReportQueries } from "../modules/reporting/infrastructure/drizzle-report.queries";
import {
  ReportRow,
  ReportContext,
  RecordGenerationInput,
  GeneratedReport,
} from "../modules/reporting/domain/report-model";
export type {
  ReportRow,
  ReportContext,
  GeneratedReportType,
  ReportFormat,
  RecordGenerationInput,
  GeneratedReport,
} from "../modules/reporting/domain/report-model";
export {
  ARTESP_MONTHLY_CONTEXT,
  ANTT_ANNUAL_CONTEXT,
} from "../modules/reporting/infrastructure/report-renderer";
@Injectable()
export class ReportsService {
  private readonly renderer: ReportRenderer;
  private readonly queries: DrizzleReportQueries;
  constructor(drizzle: DrizzleService, storage: ObjectStorage) {
    this.renderer = new ReportRenderer(storage);
    this.queries = new DrizzleReportQueries(drizzle);
  }
  async monthlyRows(month: string, roadName?: string): Promise<ReportRow[]> {
    const [year, monthNumber] = month.split("-").map(Number);
    const periodStart = new Date(Date.UTC(year, monthNumber - 1, 1));
    const periodEnd = new Date(Date.UTC(year, monthNumber, 1));
    return this.queries.fetchRows(periodStart, periodEnd, roadName);
  }

  async annualRows(year: string, roadName?: string): Promise<ReportRow[]> {
    const yearNumber = Number(year);
    const periodStart = new Date(Date.UTC(yearNumber, 0, 1));
    const periodEnd = new Date(Date.UTC(yearNumber + 1, 0, 1));
    return this.queries.fetchRows(periodStart, periodEnd, roadName);
  }

  recordGeneration(input: RecordGenerationInput): Promise<void> {
    return this.queries.recordGeneration(input);
  }
  listGenerated(): Promise<GeneratedReport[]> {
    return this.queries.listGenerated();
  }
  renderCsv(rows: ReportRow[]): string {
    return this.renderer.renderCsv(rows);
  }
  renderPdf(
    context: ReportContext,
    rows: ReportRow[],
    output?: Writable,
  ): Promise<PDFKit.PDFDocument> {
    return this.renderer.renderPdf(context, rows, output);
  }
}
