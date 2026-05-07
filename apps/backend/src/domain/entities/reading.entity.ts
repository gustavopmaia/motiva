export type ReadingSource = "iot" | "vehicle" | "satellite";
export type ReadingClassification = "ok" | "attention" | "urgent";

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
