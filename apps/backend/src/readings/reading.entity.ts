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
