import { AlertLevel } from "./risk-level";

export const SEGMENT_EVENTS_QUEUE = "segment-events";
export const ALERT_EVENTS_QUEUE = "alert-events";

export const SEGMENT_RISK_LEVEL_CHANGED_JOB = "segment.risk-level-changed";
export const WORK_ORDER_CREATE_JOB = "work-order.create";

export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
} as const;

export type ProcessReadingResultJob = {
  segmentId: string;
  score: number;
  level: AlertLevel;
  readingId: string;
};

export type CreateWorkOrderJob = ProcessReadingResultJob & {
  alertId: string;
};
