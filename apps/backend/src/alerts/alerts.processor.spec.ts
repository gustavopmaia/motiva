import { Job, UnrecoverableError } from "bullmq";
import { AlertsProcessor } from "./alerts.processor";
import { ProcessReadingResultJob } from "../common/queues";
const data: ProcessReadingResultJob = {
  segmentId: "11111111-1111-4111-8111-111111111111",
  readingId: "r-1",
  score: 60,
  level: "urgent",
};
it("validates queue messages before invoking the transactional handler", async () => {
  const handler = { execute: jest.fn() };
  const processor = new AlertsProcessor(handler as never);
  await expect(
    processor.process({ data: { ...data, score: NaN } } as Job<ProcessReadingResultJob>),
  ).rejects.toThrow(UnrecoverableError);
  expect(handler.execute).not.toHaveBeenCalled();
});
it("propagates failures for retry", async () => {
  const processor = new AlertsProcessor({
    execute: jest.fn().mockRejectedValue(new Error("Database unavailable")),
  } as never);
  await expect(processor.process({ data } as Job<ProcessReadingResultJob>)).rejects.toThrow(
    "Database unavailable",
  );
});
