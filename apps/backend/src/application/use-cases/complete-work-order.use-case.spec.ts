import { CompleteWorkOrderUseCase } from "./complete-work-order.use-case";
import { WorkOrder } from "@domain/entities/work-order.entity";
import { InvalidOperationError, NotFoundError } from "@application/errors";

const openOrder = new WorkOrder("wo-1", "seg-1", "a-1", "open", "urgent", 70, null, null);

const makeUseCase = (existing: WorkOrder | null = openOrder) => {
  const workOrderRepository = {
    findById: jest.fn().mockResolvedValue(existing),
  };
  const where = jest.fn().mockResolvedValue([]);
  const set = jest.fn().mockReturnValue({ where });
  const update = jest.fn().mockReturnValue({ set });
  const txMock = { update };
  const drizzle = {
    db: {
      transaction: jest
        .fn()
        .mockImplementation((fn: (tx: typeof txMock) => Promise<void>) => fn(txMock)),
    },
  };
  return {
    useCase: new CompleteWorkOrderUseCase(workOrderRepository as any, drizzle as any),
    workOrderRepository,
    drizzle,
  };
};

describe("CompleteWorkOrderUseCase", () => {
  it("deve concluir a OS e resetar o score do segmento para 0", async () => {
    const { useCase, drizzle } = makeUseCase();

    const result = await useCase.execute("wo-1");

    expect(result.status).toBe("completed");
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(drizzle.db.transaction).toHaveBeenCalledTimes(1);
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
