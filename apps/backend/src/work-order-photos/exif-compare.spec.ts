import { compareExif } from "./exif-compare";

const SENT = { lat: -23.55052, lon: -46.633308, capturedAt: new Date("2026-08-28T14:00:00Z") };
const TOLERANCE_METERS = 150;
const TOLERANCE_SECONDS = 86_400;

describe("compareExif", () => {
  it("returns missing_exif when the photo has no EXIF data", () => {
    const result = compareExif(SENT, null, TOLERANCE_METERS, TOLERANCE_SECONDS);

    expect(result).toEqual({ status: "missing_exif", distanceMeters: null, timeDiffSeconds: null });
  });

  it("returns verified when distance and time are within tolerance", () => {
    const exif = { lat: -23.55053, lon: -46.633309, capturedAt: new Date("2026-08-28T14:00:05Z") };

    const result = compareExif(SENT, exif, TOLERANCE_METERS, TOLERANCE_SECONDS);

    expect(result.status).toBe("verified");
    expect(result.distanceMeters).not.toBeNull();
    expect(result.timeDiffSeconds).toBe(5);
  });

  it("returns suspicious when the EXIF location is too far from the sent location", () => {
    const exif = { lat: -23.6, lon: -46.7, capturedAt: SENT.capturedAt };

    const result = compareExif(SENT, exif, TOLERANCE_METERS, TOLERANCE_SECONDS);

    expect(result.status).toBe("suspicious");
    expect(result.distanceMeters).toBeGreaterThan(TOLERANCE_METERS);
  });

  it("returns suspicious when the EXIF timestamp is too far from the sent timestamp", () => {
    const exif = { lat: SENT.lat, lon: SENT.lon, capturedAt: new Date("2026-08-01T00:00:00Z") };

    const result = compareExif(SENT, exif, TOLERANCE_METERS, TOLERANCE_SECONDS);

    expect(result.status).toBe("suspicious");
    expect(result.timeDiffSeconds).toBeGreaterThan(TOLERANCE_SECONDS);
  });
});
