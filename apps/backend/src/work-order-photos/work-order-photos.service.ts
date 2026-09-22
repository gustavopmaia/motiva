import { TrackedUploads } from "../platform/storage/tracked-uploads";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import * as exifr from "exifr";
import { DuplicateResourceError, InvalidOperationError } from "../common/errors";
import { DrizzleService } from "../database/drizzle.service";
import { workOrderPhotos } from "../database/schema";
import { WorkOrder } from "../work-orders/work-order.entity";
import { WorkOrdersService, WorkOrderActor } from "../work-orders/work-orders.service";
import { CreateWorkOrderPhotoInput } from "./work-order-photo-input.mapper";
import { ExifData, compareExif } from "./exif-compare";
import { WorkOrderPhoto, WorkOrderPhotoValidationStatus } from "./work-order-photo.entity";

const DEFAULT_DISTANCE_TOLERANCE_METERS = 150;
const DEFAULT_TIME_TOLERANCE_SECONDS = 86_400;

export type AttachPhotoResult = {
  workOrder: WorkOrder;
  photo: WorkOrderPhoto;
};

@Injectable()
export class WorkOrderPhotosService {
  private readonly distanceToleranceMeters: number;
  private readonly timeToleranceSeconds: number;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly config: ConfigService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly storage: TrackedUploads,
  ) {
    this.distanceToleranceMeters = Number(
      this.config.get<string>("WORK_ORDER_PHOTO_DISTANCE_TOLERANCE_M") ??
        DEFAULT_DISTANCE_TOLERANCE_METERS,
    );
    this.timeToleranceSeconds = Number(
      this.config.get<string>("WORK_ORDER_PHOTO_TIME_TOLERANCE_S") ??
        DEFAULT_TIME_TOLERANCE_SECONDS,
    );
  }

  async attachAndComplete(
    workOrderId: string,
    input: CreateWorkOrderPhotoInput,
    photo: Buffer,
    actor: WorkOrderActor,
  ): Promise<AttachPhotoResult> {
    await this.drizzle.transaction(async (tx) => {
      const order = await this.workOrdersService.lockOrder(tx, workOrderId);
      await this.workOrdersService.assertAccess(tx, actor, order);
    });

    const exif = await this.extractExif(photo);
    const compared = compareExif(
      input,
      exif,
      this.distanceToleranceMeters,
      this.timeToleranceSeconds,
    );
    const photoHash = createHash("sha256").update(photo).digest("hex");

    const id = randomUUID();
    const photoPath = `${id}.jpg`;
    await this.storage.put("work-order-photos", photoPath, photo);
    return this.drizzle.transaction(async (tx) => {
      const order = await this.workOrdersService.lockOrder(tx, workOrderId);
      await this.workOrdersService.assertAccess(tx, actor, order);
      const [existing] = await tx
        .select()
        .from(workOrderPhotos)
        .where(eq(workOrderPhotos.workOrderId, workOrderId));
      if (existing) {
        if (
          existing.photoHash !== photoHash ||
          existing.lat !== input.lat ||
          existing.lon !== input.lon ||
          existing.capturedAt.getTime() !== input.capturedAt.getTime()
        )
          throw new DuplicateResourceError("Work order already has different completion evidence");
        return {
          workOrder: await this.workOrdersService.complete(workOrderId, actor, tx),
          photo: toWorkOrderPhoto(existing),
        };
      }
      if (order.status === "completed")
        throw new InvalidOperationError("Work order is already completed");

      const [saved] = await tx
        .insert(workOrderPhotos)
        .values({
          id,
          workOrderId,
          photoPath,
          photoHash,
          lat: input.lat,
          lon: input.lon,
          capturedAt: input.capturedAt,
          exifLat: exif?.lat ?? null,
          exifLon: exif?.lon ?? null,
          exifCapturedAt: exif?.capturedAt ?? null,
          validationStatus: compared.status,
          distanceMeters: compared.distanceMeters,
          timeDiffSeconds: compared.timeDiffSeconds,
          createdAt: new Date(),
        })
        .returning();

      await this.storage.attach(tx, "work-order-photos", photoPath);
      const completed = await this.workOrdersService.complete(workOrderId, actor, tx);

      return { workOrder: completed, photo: toWorkOrderPhoto(saved) };
    });
  }

  private async extractExif(photo: Buffer): Promise<ExifData> {
    const data = await exifr.parse(photo, {
      gps: true,
      pick: ["latitude", "longitude", "DateTimeOriginal"],
    });
    if (!data || typeof data.latitude !== "number" || typeof data.longitude !== "number")
      return null;

    const capturedAt = data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal : null;
    if (!capturedAt) return null;

    return { lat: data.latitude, lon: data.longitude, capturedAt };
  }
}

function toWorkOrderPhoto(row: typeof workOrderPhotos.$inferSelect): WorkOrderPhoto {
  return {
    id: row.id,
    workOrderId: row.workOrderId,
    photoPath: row.photoPath,
    photoHash: row.photoHash,
    lat: row.lat,
    lon: row.lon,
    capturedAt: row.capturedAt,
    exifLat: row.exifLat,
    exifLon: row.exifLon,
    exifCapturedAt: row.exifCapturedAt,
    validationStatus: row.validationStatus as WorkOrderPhotoValidationStatus,
    distanceMeters: row.distanceMeters,
    timeDiffSeconds: row.timeDiffSeconds,
    createdAt: row.createdAt,
  };
}
