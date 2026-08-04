import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { Alert } from "./alert.entity";
import { AlertLevel } from "../common/risk-level";
import { Territory, territoryOverlap } from "../common/territory";
import { DrizzleService } from "../database/drizzle.service";
import { alerts } from "../database/schema";

type AlertRow = {
  id: string;
  segmentId: string;
  osId: string | null;
  level: string;
  score: number;
  channels: unknown;
  createdAt: Date | string;
  closedAt: Date | string | null;
};

@Injectable()
export class AlertsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAll(territory?: Territory): Promise<Alert[]> {
    const rows = await this.drizzle.db
      .select()
      .from(alerts)
      .where(
        territory
          ? sql`EXISTS (SELECT 1 FROM road_segments rs
                        WHERE rs.id = ${alerts.segmentId} AND ${territoryOverlap(territory, "rs")})`
          : undefined,
      )
      .orderBy(desc(alerts.createdAt));

    return rows.map(toAlert);
  }

  async createOrFindOpen(segmentId: string, level: AlertLevel, score: number): Promise<Alert> {
    const existing = await this.findOpenBySegmentAndLevel(segmentId, level);
    if (existing) return existing;

    const rows = await this.drizzle.db.execute<AlertRow>(sql`
      INSERT INTO alerts (id, segment_id, os_id, level, score, channels, closed_at)
      VALUES (${randomUUID()}, ${segmentId}, NULL, ${level}, ${score}, ${JSON.stringify({})}::jsonb, NULL)
      ON CONFLICT (segment_id, level) WHERE closed_at IS NULL DO NOTHING
      RETURNING id, segment_id AS "segmentId", os_id AS "osId", level, score,
                channels, created_at AS "createdAt", closed_at AS "closedAt"
    `);

    const saved = rows[0];
    if (saved) return toAlert(saved);

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

function toAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    segmentId: row.segmentId,
    osId: row.osId,
    level: row.level as AlertLevel,
    score: row.score,
    channels: (row.channels as Record<string, unknown>) ?? {},
    createdAt: new Date(row.createdAt),
    closedAt: row.closedAt === null ? null : new Date(row.closedAt),
  };
}
