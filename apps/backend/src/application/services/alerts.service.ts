import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { Alert, AlertLevel } from "@domain/entities/alert.entity";
import { DrizzleService } from "@infrastructure/database/drizzle.service";
import { alerts } from "@infrastructure/database/schema";

@Injectable()
export class AlertsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(): Promise<Alert[]> {
    const rows = await this.drizzle.db.select().from(alerts).orderBy(desc(alerts.createdAt));
    return rows.map(toAlert);
  }

  async createOrFindOpen(segmentId: string, level: AlertLevel, score: number): Promise<Alert> {
    const existing = await this.findOpenBySegmentAndLevel(segmentId, level);
    if (existing) return existing;

    const rows = await this.drizzle.db.execute<AlertInsertRow>(sql`
      INSERT INTO alerts (id, segment_id, os_id, level, score, channels, created_at, closed_at)
      VALUES (${randomUUID()}, ${segmentId}, NULL, ${level}, ${score}, ${JSON.stringify({})}::jsonb, ${new Date()}, NULL)
      ON CONFLICT (segment_id, level) WHERE closed_at IS NULL DO NOTHING
      RETURNING id, segment_id, os_id, level, score, channels, created_at, closed_at
    `);

    const saved = rows[0];
    if (saved) return toAlertFromInsert(saved);

    const createdByConcurrentJob = await this.findOpenBySegmentAndLevel(segmentId, level);
    if (createdByConcurrentJob) return createdByConcurrentJob;

    throw new Error("Failed to create or find open alert");
  }

  async updateOsId(alertId: string, workOrderId: string): Promise<void> {
    await this.drizzle.db.update(alerts).set({ osId: workOrderId }).where(eq(alerts.id, alertId));
  }

  private async findOpenBySegmentAndLevel(
    segmentId: string,
    level: AlertLevel,
  ): Promise<Alert | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(alerts)
      .where(and(eq(alerts.segmentId, segmentId), eq(alerts.level, level), isNull(alerts.closedAt)))
      .limit(1);

    return row ? toAlert(row) : null;
  }
}

function toAlert(row: typeof alerts.$inferSelect): Alert {
  return {
    id: row.id,
    segmentId: row.segmentId,
    osId: row.osId,
    level: row.level as AlertLevel,
    score: row.score,
    channels: (row.channels as Record<string, unknown>) ?? {},
    createdAt: row.createdAt,
    closedAt: row.closedAt,
  };
}

type AlertInsertRow = {
  id: string;
  segment_id: string;
  os_id: string | null;
  level: string;
  score: number;
  channels: Record<string, unknown>;
  created_at: Date;
  closed_at: Date | null;
};

function toAlertFromInsert(row: AlertInsertRow): Alert {
  return {
    id: row.id,
    segmentId: row.segment_id,
    osId: row.os_id,
    level: row.level as AlertLevel,
    score: row.score,
    channels: row.channels ?? {},
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}
