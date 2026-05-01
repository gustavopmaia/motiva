import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
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
    const [existing] = await this.drizzle.db
      .select()
      .from(alerts)
      .where(and(eq(alerts.segmentId, segmentId), eq(alerts.level, level), isNull(alerts.closedAt)))
      .limit(1);

    if (existing) return toAlert(existing);

    const [saved] = await this.drizzle.db
      .insert(alerts)
      .values({
        id: randomUUID(),
        segmentId,
        osId: null,
        level,
        score,
        channels: {},
        createdAt: new Date(),
        closedAt: null,
      })
      .returning();

    return toAlert(saved);
  }

  async updateOsId(alertId: string, workOrderId: string): Promise<void> {
    await this.drizzle.db.update(alerts).set({ osId: workOrderId }).where(eq(alerts.id, alertId));
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
