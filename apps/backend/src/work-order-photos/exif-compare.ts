import { WorkOrderPhotoValidationStatus } from "./work-order-photo.entity";

export type SentPhotoData = { lat: number; lon: number; capturedAt: Date };
export type ExifData = { lat: number; lon: number; capturedAt: Date } | null;

export type ExifCompareResult = {
  status: WorkOrderPhotoValidationStatus;
  distanceMeters: number | null;
  timeDiffSeconds: number | null;
};

const EARTH_RADIUS_METERS = 6_371_000;

function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function compareExif(
  sent: SentPhotoData,
  exif: ExifData,
  toleranceMeters: number,
  toleranceSeconds: number,
): ExifCompareResult {
  if (!exif) {
    return { status: "missing_exif", distanceMeters: null, timeDiffSeconds: null };
  }

  const distanceMeters = haversineMeters(sent, exif);
  const timeDiffSeconds = Math.abs(sent.capturedAt.getTime() - exif.capturedAt.getTime()) / 1000;

  const status: WorkOrderPhotoValidationStatus =
    distanceMeters <= toleranceMeters && timeDiffSeconds <= toleranceSeconds
      ? "verified"
      : "suspicious";

  return { status, distanceMeters, timeDiffSeconds };
}
