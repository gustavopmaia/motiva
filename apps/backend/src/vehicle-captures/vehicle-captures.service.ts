import { validObservationTime } from "../modules/monitoring/public";
import { InvalidOperationError } from "../common/errors";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { DrizzleService } from "../database/drizzle.service";
import { vehicleCaptures } from "../database/schema";
import { PHOTO_CLASSIFICATION_QUEUE, PHOTO_CLASSIFICATION_REQUESTED_JOB } from "../common/queues";
import { CreateVehicleCaptureInput } from "./vehicle-capture-input.mapper";
import { SegmentLocator } from "../road-segments/segment-locator";
import { TrackedUploads } from "../platform/storage/tracked-uploads";
import { appendEvent } from "../platform/messaging/outbox";

export type VehicleCapture = {
  id: string;
  segmentId: string;
  classified: boolean;
  createdAt: Date;
};
@Injectable()
export class VehicleCapturesService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly locator: SegmentLocator,
    private readonly storage: TrackedUploads,
  ) {}
  async create(input: CreateVehicleCaptureInput, photo: Buffer): Promise<VehicleCapture> {
    if (!validObservationTime(input.capturedAt))
      throw new InvalidOperationError(
        "capturedAt must be valid and at most 5 minutes in the future",
      );
    const segmentId = await this.locator.locate(input.lat, input.lon);
    const id = randomUUID();
    const photoPath = `${id}.jpg`;
    await this.storage.put("vehicle-captures", photoPath, photo);
    return this.drizzle.transaction(async (tx) => {
      const [saved] = await tx
        .insert(vehicleCaptures)
        .values({
          id,
          segmentId,
          photoPath,
          lat: input.lat,
          lon: input.lon,
          capturedAt: input.capturedAt,
          createdAt: new Date(),
        })
        .returning();
      await this.storage.attach(tx, "vehicle-captures", photoPath);
      await appendEvent(tx, PHOTO_CLASSIFICATION_QUEUE, PHOTO_CLASSIFICATION_REQUESTED_JOB, {
        captureId: id,
      });
      return { id: saved.id, segmentId, classified: false, createdAt: saved.createdAt };
    });
  }
}
