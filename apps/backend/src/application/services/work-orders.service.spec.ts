import { InvalidOperationError, NotFoundError } from "@application/errors";
import { WorkOrder } from "@domain/entities/work-order.entity";
import { WorkOrdersService } from "./work-orders.service";

const openOrder: WorkOrder = {
  id: "wo-1",
  segmentId: "seg-1",
  alertId: "a-1",
  status: "open",
  priority: "urgent",
  scoreAtCreation: 70,
  team: null,
  observation: null,
  createdAt: new Date(),
  startedAt: null,
  completedAt: null,
};

const makeService = (existing: WorkOrder | null = openOrder) => {
  const whereSelect = jest
    .fn()
    .mockReturnValue({ limit: jest.fn().mockResolvedValue(existing ? [existing] : []) });
  const select = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({ where: whereSelect }),
  });
  const whereUpdate = jest.fn().mockResolvedValue([]);
  const set = jest.fn().mockReturnValue({ where: whereUpdate });
  const update = jest.fn().mockReturnValue({ set });
  const tx = { update };
  const drizzle = {
    db: {
      select,
      transaction: jest
        .fn()
        .mockImplementation((fn: (txArg: typeof tx) => Promise<void>) => fn(tx)),
    },
  };

  return {
    service: new WorkOrdersService(drizzle as any),
    drizzle,
    update,
  };
};

describe("WorkOrdersService", () => {
  it("conclui a OS e executa as atualizações em transação", async () => {
    const { service, drizzle, update } = makeService();

    const result = await service.complete("wo-1");

    expect(result.status).toBe("completed");
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(drizzle.db.transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it("lança InvalidOperationError ao concluir OS já concluída", async () => {
    const { service } = makeService({ ...openOrder, status: "completed" });

    await expect(service.complete("wo-1")).rejects.toThrow(InvalidOperationError);
  });

  it("lança NotFoundError quando a OS não existe", async () => {
    const { service } = makeService(null);

    await expect(service.complete("missing")).rejects.toThrow(NotFoundError);
  });
});
