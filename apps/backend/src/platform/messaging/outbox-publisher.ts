import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Interval } from "@nestjs/schedule";
import { Queue } from "bullmq";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../../database/drizzle.service";
import {
  ALERT_EVENTS_QUEUE,
  DEFAULT_JOB_OPTIONS,
  PHOTO_CLASSIFICATION_QUEUE,
  SEGMENT_EVENTS_QUEUE,
} from "../../common/queues";

type Delivery = {
  id: string;
  queue: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  schema_version: number;
  created_at: Date | string;
};

@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);
  private running = false;
  constructor(
    private readonly drizzle: DrizzleService,
    @InjectQueue(SEGMENT_EVENTS_QUEUE) private readonly segments: Queue,
    @InjectQueue(ALERT_EVENTS_QUEUE) private readonly alerts: Queue,
    @InjectQueue(PHOTO_CLASSIFICATION_QUEUE) private readonly photos: Queue,
  ) {}

  @Interval(2000)
  async publish(): Promise<void> {
    // Local guard bounds overlapping polls; database claims coordinate replicas.
    if (this.running) return;
    this.running = true;
    try {
      const deliveries = await this.drizzle.transaction(async (tx) =>
        tx.execute<Delivery>(sql`
        WITH pending AS (
          SELECT id FROM outbox_events WHERE completed_at IS NULL AND attempts < 20 AND available_at <= clock_timestamp()
          ORDER BY available_at, created_at LIMIT 20 FOR UPDATE SKIP LOCKED
        )
        UPDATE outbox_events e SET attempts = e.attempts + 1, available_at = clock_timestamp() + interval '5 minutes'
        FROM pending WHERE e.id = pending.id RETURNING e.id, e.queue, e.type, e.payload, e.attempts, e.schema_version, e.created_at
      `),
      );
      const queues = new Map([
        [SEGMENT_EVENTS_QUEUE, this.segments],
        [ALERT_EVENTS_QUEUE, this.alerts],
        [PHOTO_CLASSIFICATION_QUEUE, this.photos],
      ]);
      await Promise.all(
        deliveries.map(async (event) => {
          try {
            const queue = queues.get(event.queue);
            if (!queue) throw new Error("Unknown event queue");
            await queue.add(
              event.type,
              {
                ...event.payload,
                eventId: event.id,
                event: {
                  type: event.type,
                  schemaVersion: event.schema_version,
                  occurredAt: new Date(event.created_at).toISOString(),
                  entityId: event.payload.segmentId ?? event.payload.captureId ?? event.id,
                  entityVersion: event.payload.riskVersion ?? null,
                  correlationId:
                    event.payload.correlationId ??
                    event.payload.readingId ??
                    event.payload.captureId ??
                    event.id,
                  causationId:
                    event.payload.causationId ??
                    event.payload.readingId ??
                    event.payload.captureId ??
                    null,
                },
              },
              {
                ...DEFAULT_JOB_OPTIONS,
                jobId: `${event.id}-${event.attempts}`,
                removeOnComplete: { age: 86400, count: 10000 },
                removeOnFail: { age: 604800, count: 10000 },
              },
            );
            await this.drizzle.db.execute(
              sql`UPDATE outbox_events SET published_at = clock_timestamp(), last_error = NULL WHERE id = ${event.id} AND attempts = ${event.attempts}`,
            );
          } catch {
            // No payload/secrets in logs; failed claims expire and can be taken by another replica.
            await this.drizzle.db.execute(
              sql`UPDATE outbox_events SET last_error = 'Publication failed', available_at = clock_timestamp() + interval '15 seconds' WHERE id = ${event.id} AND attempts = ${event.attempts}`,
            );
            this.logger.error({ eventId: event.id, action: "outbox.publish_failed" });
          }
        }),
      );
    } catch (error) {
      this.logger.error({
        action: "outbox.poll_failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      this.running = false;
    }
  }
}
