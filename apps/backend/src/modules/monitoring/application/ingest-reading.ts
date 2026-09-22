import { InvalidOperationError } from "../../../common/errors";
import { validObservationTime } from "../domain/observation-time";
import type { CreateReadingInput, Reading } from "../domain/reading";
import { readingScore } from "../domain/risk-policy";
export type NormalizedReading = CreateReadingInput & {
  segmentId: string;
  confidence: number;
  score: number;
};
export interface ReadingWriter {
  accept(input: NormalizedReading): Promise<Reading>;
}
export interface SegmentLookup {
  locate(lat: number, lon: number): Promise<string>;
}
export class IngestReading {
  constructor(
    private readonly segments: SegmentLookup,
    private readonly readings: ReadingWriter,
  ) {}
  async execute(input: CreateReadingInput): Promise<Reading> {
    if (input.observedAt && !validObservationTime(input.observedAt))
      throw new InvalidOperationError(
        "Observation time must be valid and at most 5 minutes in the future",
      );
    const segmentId = input.segmentId ?? (await this.segments.locate(input.lat, input.lon));
    const confidence =
      input.confidence == null
        ? 1
        : Math.max(
            0,
            Math.min(1, input.confidence > 1 ? input.confidence / 100 : input.confidence),
          );
    return this.readings.accept({
      ...input,
      segmentId,
      confidence,
      score: readingScore(input, confidence),
    });
  }
}
