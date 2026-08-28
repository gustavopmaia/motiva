import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { sql } from "drizzle-orm";
import { NotFoundError } from "../common/errors";
import { DrizzleService } from "../database/drizzle.service";
import { vehicleCaptures } from "../database/schema";
import {
  DEFAULT_JOB_OPTIONS,
  PHOTO_CLASSIFICATION_QUEUE,
  PHOTO_CLASSIFICATION_REQUESTED_JOB,
  PhotoClassificationRequestedJob,
} from "../common/queues";
import { CreateVehicleCaptureInput } from "./vehicle-capture-input.mapper";

type SegmentMatchRow = {
  id: string;
};

export type VehicleCapture = {
  id: string;
  segmentId: string;
  classified: boolean;
  createdAt: Date;
};

@Injectable()
export class VehicleCapturesService {
  private readonly storageDir: string;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly config: ConfigService,
    @InjectQueue(PHOTO_CLASSIFICATION_QUEUE) private readonly classificationQueue: Queue,
  ) {
    this.storageDir = this.config.get<string>("VEHICLE_CAPTURES_DIR") ?? "/data/vehicle-captures";
    mkdirSync(this.storageDir, { recursive: true });
  }

  getStorageDir(): string {
    return this.storageDir;
  }

  async create(input: CreateVehicleCaptureInput, photo: Buffer): Promise<VehicleCapture> {
    const [segment] = await this.drizzle.db.execute<SegmentMatchRow>(sql`
      SELECT id
      FROM road_segments
      ORDER BY ST_Distance(
        geometry::geography,
        ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography
      )
      LIMIT 1
    `);

    if (!segment) throw new NotFoundError("Road segment not found");

    const id = randomUUID();
    const photoPath = `${id}.jpg`;
    writeFileSync(join(this.storageDir, photoPath), photo);

    const [saved] = await this.drizzle.db
      .insert(vehicleCaptures)
      .values({
        id,
        segmentId: segment.id,
        photoPath,
        lat: input.lat,
        lon: input.lon,
        capturedAt: input.capturedAt,
        createdAt: new Date(),
      })
      .returning();

    await this.classificationQueue.add(
      PHOTO_CLASSIFICATION_REQUESTED_JOB,
      { captureId: id } satisfies PhotoClassificationRequestedJob,
      DEFAULT_JOB_OPTIONS,
    );

    return {
      id: saved.id,
      segmentId: saved.segmentId,
      classified: saved.classifiedAt != null,
      createdAt: saved.createdAt,
    };
  }
}
