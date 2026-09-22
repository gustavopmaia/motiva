import { randomUUID } from "crypto";
import { Queue, Worker } from "bullmq";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../../database/drizzle.service";
import { createTestDrizzle, migrateTestDb, testDatabaseUrl, truncateAll } from "../../test-db";
import {
  ALERT_EVENTS_QUEUE,
  PHOTO_CLASSIFICATION_QUEUE,
  SEGMENT_EVENTS_QUEUE,
} from "../../common/queues";
import { appendEvent, consumeEvent } from "./outbox";
import { OutboxPublisher } from "./outbox-publisher";
const suite = testDatabaseUrl && process.env.TEST_REDIS_URL ? describe : describe.skip;
suite("outbox with concurrent publishers and real Redis", () => {
  let db: DrizzleService;
  let queues: Queue[];
  let worker: Worker;
  beforeAll(async () => {
    db = createTestDrizzle();
    await migrateTestDb(db);
    const prefix = `motiva-test-${randomUUID()}`;
    const connection = { url: process.env.TEST_REDIS_URL! };
    queues = [SEGMENT_EVENTS_QUEUE, ALERT_EVENTS_QUEUE, PHOTO_CLASSIFICATION_QUEUE].map(
      (name) => new Queue(name, { connection, prefix }),
    );
    worker = new Worker(
      SEGMENT_EVENTS_QUEUE,
      async (job) => {
        await db.transaction((tx) => consumeEvent(tx, job.data.eventId, async () => {}));
      },
      { connection, prefix, concurrency: 4 },
    );
    await worker.waitUntilReady();
  }, 60000);
  afterAll(async () => {
    await worker?.close();
    for (const queue of queues ?? []) {
      await queue.obliterate({ force: true });
      await queue.close();
    }
    await db?.onModuleDestroy();
  });
  it("claims and completes every durable event through either publisher", async () => {
    await truncateAll(db);
    await db.transaction(async (tx) => {
      for (let i = 0; i < 10; i++)
        await appendEvent(tx, SEGMENT_EVENTS_QUEUE, "test", { sequence: i });
    });
    const publisher = () => new OutboxPublisher(db, queues[0], queues[1], queues[2]);
    await Promise.all([publisher().publish(), publisher().publish()]);
    const deadline = Date.now() + 10000;
    let count = 0;
    while (Date.now() < deadline) {
      const [row] = await db.db.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM outbox_events WHERE completed_at IS NOT NULL`,
      );
      count = row.count;
      if (count === 10) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(count).toBe(10);
    const [attempts] = await db.db.execute<{ max: number }>(
      sql`SELECT max(attempts) AS max FROM outbox_events`,
    );
    expect(attempts.max).toBe(1);
  }, 15000);
  it("recovers a published event after its Redis job is lost", async () => {
    await truncateAll(db);
    await worker.pause();
    const eventId = await db.transaction((tx) => appendEvent(tx, SEGMENT_EVENTS_QUEUE, "test", {}));
    const publisher = new OutboxPublisher(db, queues[0], queues[1], queues[2]);
    try {
      await publisher.publish();
      const job = await queues[0].getJob(`${eventId}-1`);
      expect(job).toBeDefined();
      await job!.remove(); // Simulates loss after publication, before the business effect.
      await db.db.execute(
        sql`UPDATE outbox_events SET available_at = clock_timestamp() WHERE id = ${eventId}`,
      );
      await publisher.publish();
    } finally {
      worker.resume();
    }
    for (let attempt = 0; attempt < 100; attempt++) {
      const [event] = await db.db.execute<{ completed_at: unknown; attempts: number }>(
        sql`SELECT completed_at, attempts FROM outbox_events WHERE id = ${eventId}`,
      );
      if (event.completed_at) {
        expect(event.attempts).toBe(2);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Durable event did not recover after Redis loss");
  }, 10000);
});
