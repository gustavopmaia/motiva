import { recordMaintenanceAction } from "./audit";
import { SYSTEM_ACTOR } from "../domain/work-order";
import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { DrizzleService } from "../../../database/drizzle.service";
import { consumeEvent } from "../../../platform/messaging/outbox";
import { requestSegmentReplanning } from "../../planning/public";
import {
  MaintenanceRiskContext,
  MaintenanceRiskRepository,
  RiskChangedInput,
} from "../application/risk-changed.ports";
@Injectable()
export class DrizzleMaintenanceRiskRepository extends MaintenanceRiskRepository {
  constructor(private readonly drizzle: DrizzleService) {
    super();
  }
  async withEvent(
    input: RiskChangedInput,
    action: (context: MaintenanceRiskContext) => Promise<void>,
  ): Promise<void> {
    await this.drizzle.transaction(async (tx) =>
      consumeEvent(tx, input.eventId, async () => {
        const [segment] = await tx.execute<{
          score_current: number | null;
          last_intervention_at: Date | string | null;
        }>(
          sql`SELECT score_current, last_intervention_at FROM road_segments WHERE id = ${input.segmentId} FOR UPDATE`,
        );
        if (!segment) return;
        await action({
          score: segment.score_current,
          lastInterventionAt: segment.last_intervention_at
            ? new Date(segment.last_intervention_at).toISOString()
            : null,
          ensureMaintenance: async (level, score) => {
            const [alert] = await tx.execute<{ id: string }>(sql`
        INSERT INTO alerts (id, segment_id, level, score, channels) VALUES (${randomUUID()}, ${input.segmentId}, ${level}, ${score}, '{}'::jsonb)
        ON CONFLICT (segment_id, level) WHERE closed_at IS NULL DO UPDATE SET score = EXCLUDED.score RETURNING id
      `);
            const [inserted] = await tx.execute<{ id: string }>(sql`
        INSERT INTO work_orders (id, segment_id, alert_id, status, priority, score_at_creation)
        VALUES (${randomUUID()}, ${input.segmentId}, ${alert.id}, 'open', ${level}, ${score})
        ON CONFLICT (alert_id) DO NOTHING RETURNING id
      `);
            const order =
              inserted ??
              (
                await tx.execute<{ id: string }>(
                  sql`SELECT id FROM work_orders WHERE alert_id = ${alert.id}`,
                )
              )[0];
            if (inserted)
              await recordMaintenanceAction(tx, SYSTEM_ACTOR.sub, "work-order.created", order.id, {
                alertId: alert.id,
                segmentId: input.segmentId,
                eventId: input.eventId ?? null,
              });
            await tx.execute(sql`UPDATE alerts SET os_id = ${order.id} WHERE id = ${alert.id}`);
            await requestSegmentReplanning(tx, input.segmentId);
          },
        });
      }),
    );
  }
}
