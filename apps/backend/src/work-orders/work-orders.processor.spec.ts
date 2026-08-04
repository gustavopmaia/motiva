import { Logger } from "@nestjs/common";
import { WorkOrdersProcessor } from "./work-orders.processor";
import { Job } from "bullmq";
import { CreateWorkOrderJob } from "../common/queues";

jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});

const makeProcessor = () => {
  const workOrdersService = { create: jest.fn().mockResolvedValue({ id: "wo-1" }) };
  const alertsService = { updateOsId: jest.fn().mockResolvedValue(undefined) };
  const processor = new (WorkOrdersProcessor as any)(workOrdersService, alertsService);
  return { processor, workOrdersService, alertsService };
};

const makeJob = (data: CreateWorkOrderJob) => ({ data }) as Job<CreateWorkOrderJob>;

describe("WorkOrdersProcessor", () => {
  it("deve criar work order com prioridade critical para alerta critical", async () => {
    const { processor, workOrdersService } = makeProcessor();

    await processor.process(
      makeJob({
        segmentId: "seg-1",
        score: 85,
        level: "critical",
        alertId: "a-1",
        readingId: "r-1",
      }),
    );

    expect(workOrdersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "critical" }),
    );
  });

  it("deve criar work order com prioridade attention para alerta attention", async () => {
    const { processor, workOrdersService } = makeProcessor();

    await processor.process(
      makeJob({
        segmentId: "seg-1",
        score: 35,
        level: "attention",
        alertId: "a-2",
        readingId: "r-2",
      }),
    );

    expect(workOrdersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "attention" }),
    );
  });

  it("deve relançar o erro quando o use case falha", async () => {
    const { processor, workOrdersService } = makeProcessor();
    workOrdersService.create.mockRejectedValue(new Error("service error"));

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
    ).rejects.toThrow("service error");
  });
});
