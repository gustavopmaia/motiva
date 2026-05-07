import { Logger } from "@nestjs/common";
import { AlertsProcessor } from "./alerts.processor";
import { Alert } from "@domain/entities/alert.entity";
import { Job } from "bullmq";
import {
  DEFAULT_JOB_OPTIONS,
  ProcessReadingResultJob,
  WORK_ORDER_CREATE_JOB,
} from "@application/jobs/readings-queue.types";

jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});

const makeProcessor = (existingAlert: Alert | null = null) => {
  const alertsService = {
    createOrFindOpen: jest.fn().mockResolvedValue(
      existingAlert ?? {
        id: "a-1",
        segmentId: "seg-1",
        osId: null,
        level: "urgent",
        score: 60,
        channels: {},
        createdAt: new Date(),
        closedAt: null,
      },
    ),
  };
  const alertsQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const processor = new (AlertsProcessor as any)(alertsService, alertsQueue);
  return { processor, alertsService, alertsQueue };
};

const makeJob = (data: ProcessReadingResultJob) => ({ data }) as Job<ProcessReadingResultJob>;

describe("AlertsProcessor", () => {
  it("deve criar alerta e enfileirar work order quando não existe alerta aberto", async () => {
    const { processor, alertsQueue } = makeProcessor(null);

    await processor.process(
      makeJob({ segmentId: "seg-1", score: 60, level: "urgent", readingId: "r-1" }),
    );

    expect(alertsQueue.add).toHaveBeenCalledWith(
      WORK_ORDER_CREATE_JOB,
      expect.objectContaining({ segmentId: "seg-1", level: "urgent" }),
      expect.objectContaining(DEFAULT_JOB_OPTIONS),
    );
  });

  it("deve reenfileirar work order com o alerta existente (idempotente)", async () => {
    const existing: Alert = {
      id: "a-1",
      segmentId: "seg-1",
      osId: null,
      level: "urgent",
      score: 60,
      channels: {},
      createdAt: new Date(),
      closedAt: null,
    };
    const { processor, alertsQueue } = makeProcessor(existing);

    await processor.process(
      makeJob({ segmentId: "seg-1", score: 62, level: "urgent", readingId: "r-2" }),
    );

    expect(alertsQueue.add).toHaveBeenCalledWith(
      WORK_ORDER_CREATE_JOB,
      expect.objectContaining({ alertId: "a-1", segmentId: "seg-1", level: "urgent" }),
      expect.objectContaining(DEFAULT_JOB_OPTIONS),
    );
  });

  it("deve relançar o erro quando o repositório falha", async () => {
    const { processor, alertsService } = makeProcessor();
    alertsService.createOrFindOpen.mockRejectedValue(new Error("DB error"));

    await expect(
      processor.process(
        makeJob({ segmentId: "seg-1", score: 80, level: "critical", readingId: "r-3" }),
      ),
    ).rejects.toThrow("DB error");
  });
});
