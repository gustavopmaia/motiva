import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import * as exifr from "exifr";
import { DuplicateResourceError, InvalidOperationError, NotFoundError } from "../common/errors";
import { DrizzleService } from "../database/drizzle.service";
import { workOrderPhotos } from "../database/schema";
import { WorkOrder } from "../work-orders/work-order.entity";
import { WorkOrdersService } from "../work-orders/work-orders.service";
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
  private readonly storageDir: string;
  private readonly distanceToleranceMeters: number;
  private readonly timeToleranceSeconds: number;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly config: ConfigService,
    private readonly workOrdersService: WorkOrdersService,
  ) {
    this.storageDir = this.config.get<string>("WORK_ORDER_PHOTOS_DIR") ?? "/data/work-order-photos";
    this.distanceToleranceMeters = Number(
      this.config.get<string>("WORK_ORDER_PHOTO_DISTANCE_TOLERANCE_M") ??
        DEFAULT_DISTANCE_TOLERANCE_METERS,
    );
    this.timeToleranceSeconds = Number(
      this.config.get<string>("WORK_ORDER_PHOTO_TIME_TOLERANCE_S") ??
        DEFAULT_TIME_TOLERANCE_SECONDS,
    );
    mkdirSync(this.storageDir, { recursive: true });
  }

  async attachAndComplete(
    workOrderId: string,
    input: CreateWorkOrderPhotoInput,
    photo: Buffer,
  ): Promise<AttachPhotoResult> {
    const workOrder = await this.workOrdersService.findById(workOrderId);
    if (!workOrder) throw new NotFoundError("Work order not found");
    if (workOrder.status === "completed") {
      throw new InvalidOperationError("Work order is already completed");
    }

    const existingPhoto = await this.findByWorkOrderId(workOrderId);
    if (existingPhoto) throw new DuplicateResourceError("Work order already has a photo");

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
    writeFileSync(join(this.storageDir, photoPath), photo);

    const [saved] = await this.drizzle.db
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

    const completed = await this.workOrdersService.complete(workOrderId);

    return { workOrder: completed, photo: toWorkOrderPhoto(saved) };
  }

  private async findByWorkOrderId(workOrderId: string): Promise<WorkOrderPhoto | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(workOrderPhotos)
      .where(eq(workOrderPhotos.workOrderId, workOrderId))
      .limit(1);

    return row ? toWorkOrderPhoto(row) : null;
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
