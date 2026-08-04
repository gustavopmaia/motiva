import { RedisThrottlerStorage } from "./redis-throttler.storage";

const makeRedis = () => {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const alive = (key: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry;
  };

  return {
    incr: jest.fn().mockImplementation((key: string) => {
      const entry = alive(key);
      const value = String(Number(entry?.value ?? 0) + 1);
      store.set(key, { value, expiresAt: entry?.expiresAt ?? Number.MAX_SAFE_INTEGER });
      return Promise.resolve(Number(value));
    }),
    pexpire: jest.fn().mockImplementation((key: string, ttl: number) => {
      const entry = store.get(key);
      if (entry) store.set(key, { ...entry, expiresAt: Date.now() + ttl });
      return Promise.resolve(1);
    }),
    pttl: jest.fn().mockImplementation((key: string) => {
      const entry = alive(key);
      return Promise.resolve(entry ? entry.expiresAt - Date.now() : -2);
    }),
    set: jest.fn().mockImplementation((key: string, value: string, _px: string, ttl: number) => {
      store.set(key, { value, expiresAt: Date.now() + ttl });
      return Promise.resolve("OK");
    }),
  };
};

const storageOn = (redis: ReturnType<typeof makeRedis>) =>
  new RedisThrottlerStorage({ client: Promise.resolve(redis) } as never);

describe("RedisThrottlerStorage", () => {
  it("conta os acessos e só bloqueia depois do limite", async () => {
    const storage = storageOn(makeRedis());
    const hit = () => storage.increment("ip", 60_000, 3, 0, "default");

    expect((await hit()).totalHits).toBe(1);
    expect((await hit()).totalHits).toBe(2);
    expect((await hit()).isBlocked).toBe(false);
    expect((await hit()).isBlocked).toBe(true);
  });

  it("compartilha o contador entre instâncias no mesmo Redis", async () => {
    const redis = makeRedis();
    const instanciaA = storageOn(redis);
    const instanciaB = storageOn(redis);

    await instanciaA.increment("ip", 60_000, 2, 0, "default");
    await instanciaB.increment("ip", 60_000, 2, 0, "default");
    const terceira = await instanciaA.increment("ip", 60_000, 2, 0, "default");

    expect(terceira.totalHits).toBe(3);
    expect(terceira.isBlocked).toBe(true);
  });

  it("isola chaves diferentes", async () => {
    const redis = makeRedis();
    const storage = storageOn(redis);

    await storage.increment("ip-1", 60_000, 2, 0, "default");
    const outro = await storage.increment("ip-2", 60_000, 2, 0, "default");

    expect(outro.totalHits).toBe(1);
  });

  it("mantém o bloqueio enquanto a janela de bloqueio durar", async () => {
    const storage = storageOn(makeRedis());
    for (let i = 0; i < 3; i++) await storage.increment("ip", 60_000, 2, 30_000, "default");

    const depois = await storage.increment("ip", 60_000, 2, 30_000, "default");

    expect(depois.isBlocked).toBe(true);
    expect(depois.timeToBlockExpire).toBeGreaterThan(0);
  });

  it("expira a janela e libera de novo", async () => {
    const storage = storageOn(makeRedis());
    await storage.increment("ip", 30, 1, 0, "default");
    await storage.increment("ip", 30, 1, 0, "default");

    await new Promise((resolve) => setTimeout(resolve, 60));
    const novaJanela = await storage.increment("ip", 30, 1, 0, "default");

    expect(novaJanela.totalHits).toBe(1);
    expect(novaJanela.isBlocked).toBe(false);
  });
});
