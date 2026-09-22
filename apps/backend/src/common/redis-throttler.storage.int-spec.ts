import Redis from "ioredis";
import { randomUUID } from "crypto";
import { RedisThrottlerStorage } from "./redis-throttler.storage";
const suite = process.env.TEST_REDIS_URL ? describe : describe.skip;
suite("atomic shared throttling", () => {
  let clients: Redis[];
  beforeAll(() => {
    clients = [new Redis(process.env.TEST_REDIS_URL!), new Redis(process.env.TEST_REDIS_URL!)];
  });
  afterAll(async () => {
    await Promise.all(clients.map((client) => client.quit()));
  });
  it("enforces a single limit across simultaneous callers and connections", async () => {
    const key = randomUUID();
    const storage = clients.map((client) => new RedisThrottlerStorage(client));
    const hits = await Promise.all(
      Array.from({ length: 40 }, (_, i) => storage[i % 2].increment(key, 500, 5, 500, "test")),
    );
    expect(hits.filter((hit) => !hit.isBlocked)).toHaveLength(5);
    expect(hits.filter((hit) => hit.isBlocked)).toHaveLength(35);
    expect((await storage[0].increment(randomUUID(), 500, 5, 500, "test")).totalHits).toBe(1);
  });
  it("expires counters and blocks together without leaving immortal keys", async () => {
    const storage = new RedisThrottlerStorage(clients[0]);
    const key = randomUUID();
    await storage.increment(key, 30, 1, 0, "test");
    expect((await storage.increment(key, 30, 1, 0, "test")).isBlocked).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(await storage.increment(key, 30, 1, 0, "test")).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });
});
