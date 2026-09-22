import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { connectAsync, MqttClient } from "mqtt";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../database/drizzle.service";
import {
  createTestDrizzle,
  insertSegment,
  migrateTestDb,
  testDatabaseUrl,
  truncateAll,
} from "../test-db";
import { SegmentLocator } from "../road-segments/segment-locator";
import { FusionService } from "./fusion.service";
import { ReadingsService } from "./readings.service";
import { ReadingsMqttHandler } from "./readings-mqtt.handler";

const suite = testDatabaseUrl && process.env.TEST_MQTT_URL ? describe : describe.skip;
async function until(check: () => Promise<boolean> | boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("MQTT condition did not become true");
}
suite("durable MQTT ingestion with a real broker", () => {
  let db: DrizzleService, producer: MqttClient, readings: ReadingsService;
  let handlers: ReadingsMqttHandler[];
  let group: string;
  beforeAll(async () => {
    db = createTestDrizzle();
    await migrateTestDb(db);
    readings = new ReadingsService(
      db,
      new FusionService(db),
      new SegmentLocator(db, new ConfigService({})),
    );
    producer = await connectAsync(process.env.TEST_MQTT_URL!, { protocolVersion: 5 });
  }, 60000);
  beforeEach(async () => {
    handlers = [];
    group = `test-${randomUUID()}`;
    await truncateAll(db);
    await insertSegment(db, { id: randomUUID(), roadName: "MQTT-TEST", kmStart: 0, kmEnd: 1 });
  });
  afterEach(async () => {
    await Promise.all(handlers.map((handler) => handler.onModuleDestroy()));
  });
  afterAll(async () => {
    await producer?.endAsync();
    await db?.onModuleDestroy();
  });
  async function consumer(create = jest.fn(readings.create.bind(readings))) {
    const handler = new ReadingsMqttHandler(
      new ConfigService({
        MQTT_URL: process.env.TEST_MQTT_URL,
        MQTT_CLIENT_ID: `test-${randomUUID()}`,
        MQTT_SHARED_GROUP: group,
      }),
      { create } as unknown as ReadingsService,
      db,
    );
    handlers.push(handler);
    handler.onModuleInit();
    await until(() => handler.isReady());
    return create;
  }
  const publish = (eventId: string, body?: string) =>
    producer.publishAsync(
      "sensors/mqtt-test/reading",
      body ?? JSON.stringify({ eventId, lat: 0, lon: 0, heightCm: 70 }),
      { qos: 1 },
    );
  it("shares deliveries across consumers and deduplicates producer retries", async () => {
    const first = await consumer(),
      second = await consumer();
    for (let i = 0; i < 10; i++) {
      await publish(`event-${i}`);
      await publish(`event-${i}`);
    }
    await until(() => first.mock.calls.length + second.mock.calls.length >= 20);
    await until(async () => (await db.db.execute(sql`SELECT id FROM readings`)).length === 10);
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
    expect(await db.db.execute(sql`SELECT id FROM readings`)).toHaveLength(10);
  });
  it("redelivers after persistence fails before PUBACK", async () => {
    const create = jest
      .fn(readings.create.bind(readings))
      .mockRejectedValueOnce(new Error("Simulated database outage before commit"));
    await consumer(create);
    await publish("retry-after-disconnect");
    await until(
      async () =>
        (
          await db.db.execute(
            sql`SELECT id FROM readings WHERE origin_key LIKE '%retry-after-disconnect'`,
          )
        ).length === 1,
    ).catch((error) => {
      throw new Error(
        `${error.message}; deliveries=${create.mock.calls.length}, ready=${handlers[0].isReady()}`,
      );
    });
    expect(create.mock.calls.length).toBeGreaterThanOrEqual(2);
  }, 15000);
  it("persists invalid messages in quarantine before moving on", async () => {
    await consumer();
    await publish("invalid", "not-json");
    await publish("valid-after-poison");
    await until(async () => (await db.db.execute(sql`SELECT id FROM readings`)).length === 1);
    expect(await db.db.execute(sql`SELECT id FROM ingestion_rejections`)).toHaveLength(1);
  });
});
