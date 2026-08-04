import { Logger } from "@nestjs/common";
import { DispatchCronService } from "./dispatch-cron.service";

const makeRedis = () => {
  const store = new Map<string, string>();
  return {
    store,
    set: jest.fn().mockImplementation((key: string, value: string, ...args: unknown[]) => {
      if (args.includes("NX") && store.has(key)) return Promise.resolve(null);
      store.set(key, value);
      return Promise.resolve("OK");
    }),
    getdel: jest.fn().mockImplementation((key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return Promise.resolve(value);
    }),
    del: jest.fn().mockImplementation((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
  };
};

const makeService = (redis: ReturnType<typeof makeRedis>, runDispatch = jest.fn()) => {
  const dispatchService = { runDispatch };
  const queue = { client: Promise.resolve(redis) };
  return {
    service: new DispatchCronService(dispatchService as never, queue as never),
    dispatchService,
  };
};

beforeEach(() => {
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("DispatchCronService", () => {
  it("não roda dispatch quando ninguém pediu replanejamento", async () => {
    const redis = makeRedis();
    const { service, dispatchService } = makeService(redis);

    await service.handleDispatchCron();

    expect(dispatchService.runDispatch).not.toHaveBeenCalled();
  });

  it("roda dispatch uma vez e limpa a flag", async () => {
    const redis = makeRedis();
    const { service, dispatchService } = makeService(redis, jest.fn().mockResolvedValue(undefined));

    await service.markNeedsReplan();
    await service.handleDispatchCron();
    await service.handleDispatchCron();

    expect(dispatchService.runDispatch).toHaveBeenCalledTimes(1);
  });

  it("a flag vive no Redis, então outra instância enxerga o pedido", async () => {
    const redis = makeRedis();
    const pedinte = makeService(redis);
    const executor = makeService(redis, jest.fn().mockResolvedValue(undefined));

    await pedinte.service.markNeedsReplan();
    await executor.service.handleDispatchCron();

    expect(executor.dispatchService.runDispatch).toHaveBeenCalledTimes(1);
  });

  it("só uma instância roda quando duas disparam o cron juntas", async () => {
    const redis = makeRedis();
    const primeira = makeService(
      redis,
      jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 20))),
    );
    const segunda = makeService(redis, jest.fn().mockResolvedValue(undefined));

    await primeira.service.markNeedsReplan();
    const corrida = primeira.service.handleDispatchCron();
    await segunda.service.handleDispatchCron();
    await corrida;

    expect(primeira.dispatchService.runDispatch).toHaveBeenCalledTimes(1);
    expect(segunda.dispatchService.runDispatch).not.toHaveBeenCalled();
  });

  it("devolve a flag e solta o lock quando o dispatch falha", async () => {
    const redis = makeRedis();
    const { service } = makeService(redis, jest.fn().mockRejectedValue(new Error("boom")));

    await service.markNeedsReplan();
    await expect(service.handleDispatchCron()).rejects.toThrow("boom");

    expect(redis.store.get("dispatch:needs-replan")).toBe("1");
    expect(redis.store.has("dispatch:lock")).toBe(false);
  });
});
