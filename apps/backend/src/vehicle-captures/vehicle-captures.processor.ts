import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { DrizzleService } from "../database/drizzle.service";
import { readings, vehicleCaptures } from "../database/schema";
import { PHOTO_CLASSIFICATION_QUEUE, PhotoClassificationRequestedJob } from "../common/queues";
import { ReadingsService } from "../readings/readings.service";
import { ObjectStorage } from "../platform/storage/object-storage";
import { consumeEvent } from "../platform/messaging/outbox";
import { parseCaptureEvent } from "../platform/messaging/event-validation";
import { ClassifierClient } from "./classifier-client";

@Processor(PHOTO_CLASSIFICATION_QUEUE, { concurrency: 2 })
export class VehicleCapturesProcessor extends WorkerHost {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly storage: ObjectStorage,
    private readonly classifier: ClassifierClient,
    private readonly readingsService: ReadingsService,
  ) {
    super();
  }
  async process(job: Job<PhotoClassificationRequestedJob>): Promise<void> {
    const { captureId, eventId } = parseCaptureEvent(job.data);
    const [capture] = await this.drizzle.db
      .select()
      .from(vehicleCaptures)
      .where(eq(vehicleCaptures.id, captureId));
    if (!capture) throw new Error("Capture not found");
    const [existing] = await this.drizzle.db
      .select({ id: readings.id })
      .from(readings)
      .where(eq(readings.captureId, captureId));
    if (existing) {
      await this.drizzle.transaction((tx) => consumeEvent(tx, eventId, async () => {}));
      return;
    }
    const photo = await this.storage.get("vehicle-captures", capture.photoPath);
    const result = await this.classifier.classify(
      photo,
      job.data.event?.correlationId ?? eventId ?? captureId,
    );
    await this.drizzle.transaction((tx) =>
      consumeEvent(tx, eventId, async () => {
        await tx.execute(
          sql`SELECT id FROM road_segments WHERE id = ${capture.segmentId} FOR UPDATE`,
        );
        const [alreadyRead] = await tx
          .select({ id: readings.id })
          .from(readings)
          .where(eq(readings.captureId, captureId));
        if (alreadyRead) return;
        await this.readingsService.create(
          {
            source: "vehicle",
            segmentId: capture.segmentId,
            captureId,
            originKey: `capture:${captureId}`,
            observedAt: capture.capturedAt,
            lat: capture.lat,
            lon: capture.lon,
            classification: result.classification,
            confidence: result.confidence,
            metadata: {
              captureId,
              rawProbability: result.rawProbability,
              modelVersion: result.modelVersion ?? null,
              preprocessingVersion: result.preprocessingVersion ?? null,
            },
          },
          tx,
        );
        await tx
          .update(vehicleCaptures)
          .set({
            classification: result.classification,
            confidence: result.confidence,
            classifiedAt: new Date(),
          })
          .where(eq(vehicleCaptures.id, captureId));
      }),
    );
  }
}
