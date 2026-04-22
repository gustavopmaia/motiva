import { Reading } from "@domain/entities/reading.entity";

export const READING_CREATED_EVENT = "reading.created";
export const SCORE_UPDATED_EVENT = "road-segment.score-updated";

export type ReadingCreatedEvent = {
  reading: Reading;
  segmentId: string;
};

export type ScoreUpdatedEvent = {
  segmentId: string;
  previousScore: number | null;
  currentScore: number;
  divergence: boolean;
};
