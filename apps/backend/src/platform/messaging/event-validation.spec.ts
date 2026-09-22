import { randomUUID } from "crypto";
import { UnrecoverableError } from "bullmq";
import { parseCaptureEvent, parseRiskEvent } from "./event-validation";
const risk = { segmentId: randomUUID(), readingId: randomUUID(), score: 60, level: "urgent" };
const event = {
  schemaVersion: 1,
  type: "segment.risk-level-changed",
  occurredAt: new Date().toISOString(),
  entityId: risk.segmentId,
  entityVersion: 1,
  correlationId: risk.readingId,
};
it("accepts legacy jobs during migration and versioned events", () => {
  expect(parseRiskEvent(risk)).toEqual(risk);
  expect(parseRiskEvent({ ...risk, event })).toMatchObject(risk);
});
it("rejects unsupported versions before applying effects", () => {
  expect(() => parseRiskEvent({ ...risk, event: { ...event, schemaVersion: 2 } })).toThrow(
    UnrecoverableError,
  );
});
it("rejects event types delivered to the wrong consumer", () => {
  expect(() => parseCaptureEvent({ captureId: randomUUID(), event })).toThrow(UnrecoverableError);
});
