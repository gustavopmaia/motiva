import { AlertLevel } from "@domain/entities/alert.entity";

export const READINGS_QUEUE = "readings-events";
export const ALERTS_QUEUE = "alerts-events";

export type ProcessReadingResultJob = {
  segmentId: string;
  score: number;
  level: AlertLevel;
  readingId: string;
};

export type CreateWorkOrderJob = ProcessReadingResultJob & {
  alertId: string;
};
