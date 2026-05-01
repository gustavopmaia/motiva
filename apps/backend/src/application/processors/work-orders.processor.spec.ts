import { Logger } from "@nestjs/common";
import { WorkOrdersProcessor } from "./work-orders.processor";
import { Job } from "bullmq";
import { CreateWorkOrderJob } from "@application/jobs/readings-queue.types";

jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});

const makeProcessor = () => {
  const createWorkOrder = { execute: jest.fn().mockResolvedValue({ id: "wo-1" }) };
  const alertRepository = { updateOsId: jest.fn().mockResolvedValue(undefined) };
  const processor = new (WorkOrdersProcessor as any)(createWorkOrder, alertRepository);
  return { processor, createWorkOrder, alertRepository };
};

const makeJob = (data: CreateWorkOrderJob) => ({ data }) as Job<CreateWorkOrderJob>;

describe("WorkOrdersProcessor", () => {
  it("deve criar work order com prioridade critical para alerta critical", async () => {
    const { processor, createWorkOrder } = makeProcessor();

    await processor.process(
      makeJob({
        segmentId: "seg-1",
        score: 85,
        level: "critical",
        alertId: "a-1",
        readingId: "r-1",
      }),
    );

    expect(createWorkOrder.execute).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "critical" }),
    );
  });

  it("deve criar work order com prioridade normal para alerta attention", async () => {
    const { processor, createWorkOrder } = makeProcessor();

    await processor.process(
      makeJob({
        segmentId: "seg-1",
        score: 35,
        level: "attention",
        alertId: "a-2",
        readingId: "r-2",
      }),
    );

    expect(createWorkOrder.execute).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "normal" }),
    );
  });

  it("deve relançar o erro quando o use case falha", async () => {
    const { processor, createWorkOrder } = makeProcessor();
    createWorkOrder.execute.mockRejectedValue(new Error("use case error"));

    await expect(
      processor.process(
        makeJob({
          segmentId: "seg-1",
          score: 60,
          level: "urgent",
          alertId: "a-3",
          readingId: "r-3",
        }),
      ),
    ).rejects.toThrow("use case error");
  });
});
