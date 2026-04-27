import { Injectable } from "@nestjs/common";
import { eq, and, desc } from "drizzle-orm";
import { Alert, AlertLevel } from "@domain/entities/alert.entity";
import { AlertRepository } from "@domain/repositories/alert.repository";
import { DrizzleService } from "../drizzle.service";
import { alerts } from "../schema";

@Injectable()
export class AlertDrizzleRepository implements AlertRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async save(alert: Alert): Promise<Alert> {
    const [saved] = await this.drizzle.db
      .insert(alerts)
      .values({
        id: alert.id,
        segmentId: alert.segmentId,
        osId: alert.osId,
        level: alert.level,
        score: alert.score,
        channels: alert.channels,
        createdAt: alert.createdAt,
      })
      .returning();

    return this.toEntity(saved);
  }

  async findOpenBySegmentAndLevel(segmentId: string, level: AlertLevel): Promise<Alert | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(alerts)
      .where(and(eq(alerts.segmentId, segmentId), eq(alerts.level, level)))
      .limit(1);

    if (!row) return null;

    return this.toEntity(row);
  }

  async findAll(): Promise<Alert[]> {
    const rows = await this.drizzle.db.select().from(alerts).orderBy(desc(alerts.createdAt));

    return rows.map((row) => this.toEntity(row));
  }

  private toEntity(row: typeof alerts.$inferSelect): Alert {
    return new Alert(
      row.id,
      row.segmentId,
      row.osId,
      row.level as AlertLevel,
      row.score,
      (row.channels as Record<string, unknown>) ?? {},
      row.createdAt,
    );
  }
}
