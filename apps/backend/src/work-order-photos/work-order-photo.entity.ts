export const WORK_ORDER_PHOTO_VALIDATION_STATUSES = [
  "verified",
  "suspicious",
  "missing_exif",
] as const;

export type WorkOrderPhotoValidationStatus = (typeof WORK_ORDER_PHOTO_VALIDATION_STATUSES)[number];

export type WorkOrderPhoto = {
  id: string;
  workOrderId: string;
  photoPath: string;
  photoHash: string;
  lat: number;
  lon: number;
  capturedAt: Date;
  exifLat: number | null;
  exifLon: number | null;
  exifCapturedAt: Date | null;
  validationStatus: WorkOrderPhotoValidationStatus;
  distanceMeters: number | null;
  timeDiffSeconds: number | null;
  createdAt: Date;
};
