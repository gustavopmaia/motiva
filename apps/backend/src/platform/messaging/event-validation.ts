import { UnrecoverableError } from "bullmq";
import {
  ProcessReadingResultJob,
  SEGMENT_RISK_LEVEL_CHANGED_JOB,
  PHOTO_CLASSIFICATION_REQUESTED_JOB,
} from "../../common/queues";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateEnvelope(value: Record<string, unknown>, expectedType: string): void {
  // Messages already queued by the old release have no envelope.
  if (value.event === undefined) return;
  if (!value.event || typeof value.event !== "object")
    throw new UnrecoverableError("Invalid event envelope");
  const event = value.event as Record<string, unknown>;
  if (
    event.schemaVersion !== 1 ||
    event.type !== expectedType ||
    typeof event.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(event.occurredAt)) ||
    typeof event.entityId !== "string" ||
    !uuid.test(event.entityId) ||
    typeof event.correlationId !== "string" ||
    !event.correlationId ||
    (event.entityVersion !== null &&
      (!Number.isSafeInteger(event.entityVersion) || Number(event.entityVersion) < 0))
  ) {
    throw new UnrecoverableError("Unsupported or invalid event envelope");
  }
}
export function parseRiskEvent(value: unknown): ProcessReadingResultJob {
  if (!value || typeof value !== "object") throw new UnrecoverableError("Invalid risk event");
  const p = value as Record<string, unknown>;
  if (
    typeof p.segmentId !== "string" ||
    !uuid.test(p.segmentId) ||
    typeof p.readingId !== "string" ||
    typeof p.score !== "number" ||
    !Number.isFinite(p.score) ||
    p.score < 0 ||
    p.score > 100 ||
    !["attention", "urgent", "critical"].includes(String(p.level)) ||
    (p.eventId !== undefined && (typeof p.eventId !== "string" || !uuid.test(p.eventId))) ||
    (p.interventionAt !== undefined &&
      p.interventionAt !== null &&
      (typeof p.interventionAt !== "string" || !Number.isFinite(Date.parse(p.interventionAt))))
  ) {
    throw new UnrecoverableError("Invalid risk event");
  }
  validateEnvelope(p, SEGMENT_RISK_LEVEL_CHANGED_JOB);
  return p as ProcessReadingResultJob;
}
export function parseCaptureEvent(value: unknown): { captureId: string; eventId?: string } {
  if (!value || typeof value !== "object") throw new UnrecoverableError("Invalid capture event");
  const p = value as Record<string, unknown>;
  if (
    typeof p.captureId !== "string" ||
    !uuid.test(p.captureId) ||
    (p.eventId !== undefined && (typeof p.eventId !== "string" || !uuid.test(p.eventId)))
  )
    throw new UnrecoverableError("Invalid capture event");
  validateEnvelope(p, PHOTO_CLASSIFICATION_REQUESTED_JOB);
  return p as { captureId: string; eventId?: string };
}
