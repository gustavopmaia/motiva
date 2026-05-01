import { CompleteWorkOrderUseCase } from "./complete-work-order.use-case";
import { WorkOrder } from "@domain/entities/work-order.entity";
import { InvalidOperationError, NotFoundError } from "@application/errors";

const openOrder = new WorkOrder("wo-1", "seg-1", "a-1", "open", "urgent", 70, null, null);

const makeUseCase = (existing: WorkOrder | null = openOrder) => {
  const workOrderRepository = {
    findById: jest.fn().mockResolvedValue(existing),
    update: jest.fn().mockImplementation((wo: WorkOrder) => Promise.resolve(wo)),
  };
  const roadSegmentRepository = { updateScore: jest.fn().mockResolvedValue(undefined) };
  return {
    useCase: new CompleteWorkOrderUseCase(workOrderRepository as any, roadSegmentRepository as any),
    workOrderRepository,
    roadSegmentRepository,
  };
};

describe("CompleteWorkOrderUseCase", () => {
  it("deve concluir a OS e resetar o score do segmento para 0", async () => {
    const { useCase, roadSegmentRepository } = makeUseCase();

    const result = await useCase.execute("wo-1");

    expect(result.status).toBe("completed");
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(roadSegmentRepository.updateScore).toHaveBeenCalledWith("seg-1", 0, false);
  });

  it("deve lançar InvalidOperationError ao tentar concluir uma OS já concluída", async () => {
    const completedOrder = new WorkOrder(
      "wo-1",
      "seg-1",
      "a-1",
      "completed",
      "urgent",
      70,
      null,
      null,
    );
    const { useCase } = makeUseCase(completedOrder);

    await expect(useCase.execute("wo-1")).rejects.toThrow(InvalidOperationError);
  });

  it("deve lançar NotFoundError quando a OS não existir", async () => {
    const { useCase } = makeUseCase(null);

    await expect(useCase.execute("wo-inexistente")).rejects.toThrow(NotFoundError);
  });
});
