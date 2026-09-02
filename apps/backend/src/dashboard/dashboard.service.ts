import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../database/drizzle.service";

const PHOTO_EVIDENCE_PERIOD_DAYS = 30;

// Mesmos prazos usados pelo escalonamento de prioridade do dispatch
// (dispatch.service.ts, SLA_DAYS_BY_PRIORITY) — se um dia esses valores
// mudarem, atualizar os dois juntos.
const SLA_DAYS = { critical: 2, urgent: 7, attention: 30 } as const;

export type DashboardSummary = {
  segments: { total: number; averageScore: number | null; criticalCount: number };
  photoEvidence: {
    periodDays: number;
    verified: number;
    suspicious: number;
    missingExif: number;
  };
  workOrders: {
    open: number;
    completed: number;
    critical: number;
    urgent: number;
    attention: number;
    overdue: number;
  };
  reports: { totalGenerated: number; lastGeneratedAt: Date | null };
};

@Injectable()
export class DashboardService {
  constructor(private readonly drizzle: DrizzleService) {}

  async getSummary(): Promise<DashboardSummary> {
    const [segmentsRow] = await this.drizzle.db.execute<{
      total: string;
      averageScore: string | null;
      criticalCount: string;
    }>(sql`
      SELECT
        count(*) AS total,
        avg(score_current) AS "averageScore",
        count(*) FILTER (WHERE score_current >= 75) AS "criticalCount"
      FROM road_segments
    `);

    const photoRows = await this.drizzle.db.execute<{
      validationStatus: string;
      count: string;
    }>(sql`
      SELECT p.validation_status AS "validationStatus", count(*) AS count
      FROM work_order_photos p
      INNER JOIN work_orders wo ON wo.id = p.work_order_id
      WHERE wo.completed_at >= now() - make_interval(days => ${PHOTO_EVIDENCE_PERIOD_DAYS})
      GROUP BY p.validation_status
    `);
    const photoCounts = Object.fromEntries(
      photoRows.map((r) => [r.validationStatus, Number(r.count)]),
    );

    const [workOrderRow] = await this.drizzle.db.execute<{
      open: string;
      completed: string;
      critical: string;
      urgent: string;
      attention: string;
      overdue: string;
    }>(sql`
      SELECT
        count(*) FILTER (WHERE status IN ('open', 'in_progress')) AS open,
        count(*) FILTER (WHERE status = 'completed') AS completed,
        count(*) FILTER (WHERE status IN ('open', 'in_progress') AND priority = 'critical') AS critical,
        count(*) FILTER (WHERE status IN ('open', 'in_progress') AND priority = 'urgent') AS urgent,
        count(*) FILTER (WHERE status IN ('open', 'in_progress') AND priority = 'attention') AS attention,
        count(*) FILTER (
          WHERE status IN ('open', 'in_progress') AND (
            (priority = 'critical' AND created_at < now() - make_interval(days => ${SLA_DAYS.critical})) OR
            (priority = 'urgent' AND created_at < now() - make_interval(days => ${SLA_DAYS.urgent})) OR
            (priority = 'attention' AND created_at < now() - make_interval(days => ${SLA_DAYS.attention}))
          )
        ) AS overdue
      FROM work_orders
    `);

    const [reportsRow] = await this.drizzle.db.execute<{
      totalGenerated: string;
      lastGeneratedAt: string | null;
    }>(sql`
      SELECT count(*) AS "totalGenerated", max(generated_at) AS "lastGeneratedAt"
      FROM generated_reports
    `);

    return {
      segments: {
        total: Number(segmentsRow.total),
        averageScore: segmentsRow.averageScore ? Number(segmentsRow.averageScore) : null,
        criticalCount: Number(segmentsRow.criticalCount),
      },
      photoEvidence: {
        periodDays: PHOTO_EVIDENCE_PERIOD_DAYS,
        verified: photoCounts.verified ?? 0,
        suspicious: photoCounts.suspicious ?? 0,
        missingExif: photoCounts.missing_exif ?? 0,
      },
      workOrders: {
        open: Number(workOrderRow.open),
        completed: Number(workOrderRow.completed),
        critical: Number(workOrderRow.critical),
        urgent: Number(workOrderRow.urgent),
        attention: Number(workOrderRow.attention),
        overdue: Number(workOrderRow.overdue),
      },
      reports: {
        totalGenerated: Number(reportsRow.totalGenerated),
        lastGeneratedAt: reportsRow.lastGeneratedAt ? new Date(reportsRow.lastGeneratedAt) : null,
      },
    };
  }
}
