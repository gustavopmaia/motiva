import { Logger } from "@nestjs/common";
import { AlertsProcessor } from "./alerts.processor";
import { Alert } from "@domain/entities/alert.entity";
import { Job } from "bullmq";
import { ProcessReadingResultJob } from "@application/jobs/readings-queue.types";

jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});

const makeProcessor = (existingAlert: Alert | null = null) => {
  const alertRepository = {
    findOpenBySegmentAndLevel: jest.fn().mockResolvedValue(existingAlert),
    save: jest.fn().mockImplementation((a: Alert) => Promise.resolve(a)),
  };
  const alertsQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const processor = new (AlertsProcessor as any)(alertRepository, alertsQueue);
  return { processor, alertRepository, alertsQueue };
};

const makeJob = (data: ProcessReadingResultJob) => ({ data }) as Job<ProcessReadingResultJob>;

describe("AlertsProcessor", () => {
  it("deve criar alerta e enfileirar work order quando não existe alerta aberto", async () => {
    const { processor, alertsQueue } = makeProcessor(null);

    await processor.process(
      makeJob({ segmentId: "seg-1", score: 60, level: "urgent", readingId: "r-1" }),
    );

    expect(alertsQueue.add).toHaveBeenCalledWith(
      "create-work-order",
      expect.objectContaining({ segmentId: "seg-1", level: "urgent" }),
    );
  });

  it("deve ignorar quando já existe alerta aberto para o mesmo segmento e nível", async () => {
    const existing = new Alert("a-1", "seg-1", null, "urgent", 60, {});
    const { processor, alertsQueue } = makeProcessor(existing);

    await processor.process(
      makeJob({ segmentId: "seg-1", score: 62, level: "urgent", readingId: "r-2" }),
    );

    expect(alertsQueue.add).not.toHaveBeenCalled();
  });

  it("deve relançar o erro quando o repositório falha", async () => {
    const { processor, alertRepository } = makeProcessor();
    alertRepository.findOpenBySegmentAndLevel.mockRejectedValue(new Error("DB error"));

    await expect(
      processor.process(
        makeJob({ segmentId: "seg-1", score: 80, level: "critical", readingId: "r-3" }),
      ),
    ).rejects.toThrow("DB error");
  });
});
