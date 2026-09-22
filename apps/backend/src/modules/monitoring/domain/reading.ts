export const READING_SOURCES = ["iot", "vehicle", "satellite"] as const;
export const READING_CLASSIFICATIONS = ["ok", "attention", "urgent"] as const;

export type ReadingSource = (typeof READING_SOURCES)[number];
export type ReadingClassification = (typeof READING_CLASSIFICATIONS)[number];

export type Reading = {
  id: string;
  segmentId: string;
  source: ReadingSource;
  heightCm: number | null;
  classification: ReadingClassification | null;
  confidence: number;
  score: number;
  lat: number;
  lon: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

type CreateIotReadingInput = {
  source: "iot";
  lat: number;
  lon: number;
  heightCm: number;
  confidence?: number;
  metadata?: Record<string, unknown> | null;
};

type CreateVehicleReadingInput = {
  source: "vehicle";
  lat: number;
  lon: number;
  classification: ReadingClassification;
  confidence: number;
  metadata?: Record<string, unknown> | null;
};

type CreateSatelliteReadingInput = {
  source: "satellite";
  lat: number;
  lon: number;
  ndvi: number;
  confidence?: number;
  metadata?: Record<string, unknown> | null;
};

export type CreateReadingInput = (
  | CreateIotReadingInput
  | CreateVehicleReadingInput
  | CreateSatelliteReadingInput
) & {
  observedAt?: Date;
  originKey?: string;
  /** Internal identity, never mapped directly from an untrusted HTTP body. */
  captureId?: string;
  segmentId?: string;
};
