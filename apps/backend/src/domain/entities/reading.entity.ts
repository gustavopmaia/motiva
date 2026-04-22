export type ReadingSource = "iot" | "vehicle" | "satellite";
export type ReadingClassification = "ok" | "attention" | "urgent";

export class Reading {
  constructor(
    public readonly id: string,
    public readonly segmentId: string,
    public readonly source: ReadingSource,
    public readonly heightCm: number | null,
    public readonly classification: ReadingClassification | null,
    public readonly confidence: number,
    public readonly score: number,
    public readonly lat: number,
    public readonly lon: number,
    public readonly metadata: Record<string, unknown> | null,
    public readonly createdAt: Date = new Date(),
  ) {}
}
