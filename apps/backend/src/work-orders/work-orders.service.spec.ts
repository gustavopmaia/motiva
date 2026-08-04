import { InvalidOperationError, NotFoundError } from "../common/errors";
import { WorkOrder } from "./work-order.entity";
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

const makeService = (
  existing: WorkOrder | null = openOrder,
  saved: WorkOrder | null = null,
  updatedRows: WorkOrder[] = [openOrder],
) => {
  const dispatchCronService = { markNeedsReplan: jest.fn() };
  const whereSelect = jest
    .fn()
    .mockReturnValue({ limit: jest.fn().mockResolvedValue(existing ? [existing] : []) });
  const select = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({ where: whereSelect }),
  });
  const returningInsert = jest.fn().mockResolvedValue(saved ? [saved] : []);
  const onConflictDoNothing = jest.fn().mockReturnValue({ returning: returningInsert });
  const valuesInsert = jest.fn().mockReturnValue({ onConflictDoNothing });
  const insert = jest.fn().mockReturnValue({ values: valuesInsert });
  const whereUpdate = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue(updatedRows),
    then: (resolve: (value: unknown) => void) => resolve([]),
  });
  const set = jest.fn().mockReturnValue({ where: whereUpdate });
  const update = jest.fn().mockReturnValue({ set });
  const tx = { update };
  const drizzle = {
    db: {
      select,
      insert,
      update,
      transaction: jest
        .fn()
        .mockImplementation((fn: (txArg: typeof tx) => Promise<void>) => fn(tx)),
    },
  };

  return {
    service: new WorkOrdersService(drizzle as any, dispatchCronService as any),
    dispatchCronService,
    drizzle,
    insert,
    update,
  };
};

describe("WorkOrdersService", () => {
  it("reutiliza OS existente quando o alerta já possui uma OS", async () => {
    const { service, dispatchCronService } = makeService(openOrder);

    const result = await service.create({
      segmentId: "seg-1",
      alertId: "a-1",
      priority: "urgent",
      scoreAtCreation: 70,
    });

    expect(result.id).toBe("wo-1");
    expect(dispatchCronService.markNeedsReplan).not.toHaveBeenCalled();
  });

  it("marca replanejamento quando cria uma OS nova", async () => {
    const { service, dispatchCronService } = makeService(null, openOrder);

    const result = await service.create({
      segmentId: "seg-1",
      alertId: "a-1",
      priority: "urgent",
      scoreAtCreation: 70,
    });

    expect(result.id).toBe("wo-1");
    expect(dispatchCronService.markNeedsReplan).toHaveBeenCalledTimes(1);
  });

  it("conclui a OS e executa as atualizações em transação", async () => {
    const { service, drizzle, update } = makeService();

    const result = await service.complete("wo-1");

    expect(result.status).toBe("completed");
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(drizzle.db.transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(4);
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

describe("WorkOrdersService.update", () => {
  const inProgress: WorkOrder = { ...openOrder, status: "in_progress" };

  it("marca replanejamento ao mover a OS para in_progress", async () => {
    const { service, dispatchCronService } = makeService(openOrder, null, [inProgress]);

    await service.update("wo-1", { status: "in_progress" });

    expect(dispatchCronService.markNeedsReplan).toHaveBeenCalledTimes(1);
  });

  it("marca replanejamento ao devolver a OS para open", async () => {
    const { service, dispatchCronService } = makeService(inProgress, null, [openOrder]);

    await service.update("wo-1", { status: "open" });

    expect(dispatchCronService.markNeedsReplan).toHaveBeenCalledTimes(1);
  });

  it("marca replanejamento ao trocar a equipe", async () => {
    const { service, dispatchCronService } = makeService(openOrder, null, [
      { ...openOrder, team: "Equipe Sul" },
    ]);

    await service.update("wo-1", { team: "Equipe Sul" });

    expect(dispatchCronService.markNeedsReplan).toHaveBeenCalledTimes(1);
  });

  it("não replaneja quando nada relevante muda", async () => {
    const { service, dispatchCronService } = makeService(openOrder, null, [openOrder]);

    await service.update("wo-1", { observation: "anotação nova" });

    expect(dispatchCronService.markNeedsReplan).not.toHaveBeenCalled();
  });

  it("lança NotFoundError quando a OS some entre a leitura e o update", async () => {
    const { service } = makeService(openOrder, null, []);

    await expect(service.update("wo-1", { status: "in_progress" })).rejects.toThrow(NotFoundError);
  });

  it("recusa atualizar OS já concluída", async () => {
    const { service } = makeService({ ...openOrder, status: "completed" });

    await expect(service.update("wo-1", { status: "open" })).rejects.toThrow(InvalidOperationError);
  });
});
