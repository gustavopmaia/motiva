export const SCORE_UPDATED_EVENT = "road-segment.score-updated";

export type ScoreUpdatedEvent = {
  segmentId: string;
  previousScore: number | null;
  currentScore: number;
  divergence: boolean;
};
