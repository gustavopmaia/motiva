import { and, desc, eq, gte, lt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { DrizzleService } from "../../../database/drizzle.service";
import {
  generatedReports,
  roadSegments,
  users,
  workOrderPhotos,
  workOrders,
} from "../../../database/schema";
import { ReportRow, RecordGenerationInput, GeneratedReport } from "../domain/report-model";
/** Cross-module reporting projection: joins are confined to this read adapter. */
export class DrizzleReportQueries {
  constructor(private readonly drizzle: DrizzleService) {}
  async fetchRows(periodStart: Date, periodEnd: Date, roadName?: string): Promise<ReportRow[]> {
    const conditions = [
      eq(workOrders.status, "completed"),
      gte(workOrders.completedAt, periodStart),
      lt(workOrders.completedAt, periodEnd),
    ];
    if (roadName) conditions.push(eq(roadSegments.roadName, roadName));

    return this.drizzle.db
      .select({
        roadName: roadSegments.roadName,
        direction: roadSegments.direction,
        kmStart: roadSegments.kmStart,
        kmEnd: roadSegments.kmEnd,
        location: workOrders.location,
        team: workOrders.team,
        completedAt: workOrders.completedAt,
        photoPath: workOrderPhotos.photoPath,
        photoHash: workOrderPhotos.photoHash,
        photoValidationStatus: workOrderPhotos.validationStatus,
      })
      .from(workOrders)
      .innerJoin(roadSegments, eq(workOrders.segmentId, roadSegments.id))
      .leftJoin(workOrderPhotos, eq(workOrderPhotos.workOrderId, workOrders.id))
      .where(and(...conditions))
      .orderBy(roadSegments.roadName, roadSegments.kmStart);
  }

  async recordGeneration(input: RecordGenerationInput): Promise<void> {
    await this.drizzle.db.insert(generatedReports).values({
      id: randomUUID(),
      reportType: input.reportType,
      period: input.period,
      format: input.format,
      roadName: input.roadName,
      generatedBy: input.userId,
      generatedAt: new Date(),
    });
  }

  async listGenerated(): Promise<GeneratedReport[]> {
    const rows = await this.drizzle.db
      .select({
        id: generatedReports.id,
        reportType: generatedReports.reportType,
        period: generatedReports.period,
        format: generatedReports.format,
        roadName: generatedReports.roadName,
        generatedByEmail: users.email,
        generatedAt: generatedReports.generatedAt,
      })
      .from(generatedReports)
      .leftJoin(users, eq(users.id, generatedReports.generatedBy))
      .orderBy(desc(generatedReports.generatedAt))
      .limit(100);

    return rows;
  }
}
