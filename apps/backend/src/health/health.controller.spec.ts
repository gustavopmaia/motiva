import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";

const makeController = (dbOk = true, redisOk = true) => {
  const execute = jest.fn().mockImplementation(() => {
    if (!dbOk) return Promise.reject(new Error("connection refused"));
    return Promise.resolve([{ "?column?": 1 }]);
  });
  const ping = jest.fn().mockImplementation(() => {
    if (!redisOk) return Promise.reject(new Error("connection refused"));
    return Promise.resolve("PONG");
  });

  return new HealthController(
    { db: { execute } } as never,
    {
      client: Promise.resolve({ ping }),
    } as never,
  );
};

describe("HealthController", () => {
  it("responde ok quando Postgres e Redis respondem", async () => {
    await expect(makeController().check()).resolves.toEqual({ status: "ok" });
  });

  it("falha quando o Postgres está fora", async () => {
    await expect(makeController(false, true).check()).rejects.toThrow(ServiceUnavailableException);
  });

  it("falha quando o Redis está fora", async () => {
    await expect(makeController(true, false).check()).rejects.toThrow(ServiceUnavailableException);
  });

  it("aponta qual dependência caiu", async () => {
    try {
      await makeController(false, true).check();
      fail("deveria ter falhado");
    } catch (error) {
      expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
        details: { database: false, redis: true },
      });
    }
  });

  describe("classifier", () => {
    const role = process.env.BACKEND_ROLE;
    afterEach(() => {
      if (role === undefined) delete process.env.BACKEND_ROLE;
      else process.env.BACKEND_ROLE = role;
    });
    const withDownClassifier = () => {
      const base = makeController() as unknown as Record<string, unknown>;
      return new HealthController(
        base.drizzle as never,
        base.queue as never,
        undefined,
        undefined,
        { checkAvailability: () => Promise.reject(new Error("down")) } as never,
      );
    };

    it("nao derruba o processo all quando o classifier cai", async () => {
      process.env.BACKEND_ROLE = "all";
      await expect(withDownClassifier().check()).resolves.toEqual({ status: "ok" });
    });

    it("tira o worker de imagens de circulacao quando o classifier cai", async () => {
      process.env.BACKEND_ROLE = "images";
      await expect(withDownClassifier().check()).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
