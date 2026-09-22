import { spawn, ChildProcess } from "child_process";
import { createServer } from "net";
import { createHash, randomUUID } from "crypto";
import { resolve } from "path";
import { sql } from "drizzle-orm";
import { DrizzleService } from "../database/drizzle.service";
import {
  createTestDrizzle,
  insertSegment,
  migrateTestDb,
  testDatabaseUrl,
  truncateAll,
} from "../test-db";

const suite = testDatabaseUrl && process.env.TEST_REDIS_URL ? describe : describe.skip;
const children: ChildProcess[] = [];
const logs = new Map<ChildProcess, string>();
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
async function start(role: "api" | "domain"): Promise<{ child: ChildProcess; url: string }> {
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(__dirname, "../../dist/src/main.js")], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      BACKEND_ROLE: role,
      PORT: String(port),
      LOG_LEVEL: "error",
      DATABASE_URL: testDatabaseUrl,
      REDIS_URL: process.env.TEST_REDIS_URL,
      JWT_SECRET: "runtime-integration-test-secret",
      DB_POOL_MAX: "2",
      MQTT_URL: "",
      STORAGE_DRIVER: "local",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  logs.set(child, "");
  for (const stream of [child.stdout, child.stderr])
    stream?.on("data", (data) => logs.set(child, (logs.get(child) + String(data)).slice(-5000)));
  const url = `http://127.0.0.1:${port}/api/v1`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Runtime ${role} exited: ${logs.get(child)}`);
    try {
      if ((await fetch(`${url}/health/ready`, { signal: AbortSignal.timeout(1000) })).ok)
        return { child, url };
    } catch {
      /* wait for the listener and dependencies */
    }
    await pause(100);
  }
  throw new Error(`Runtime ${role} did not become ready: ${logs.get(child)}`);
}
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

suite("multiple API and worker processes", () => {
  let db: DrizzleService;
  let apis: Awaited<ReturnType<typeof start>>[];
  let workers: Awaited<ReturnType<typeof start>>[];
  const apiKey = randomUUID();
  const segmentId = randomUUID();
  beforeAll(async () => {
    db = createTestDrizzle();
    await migrateTestDb(db);
    await truncateAll(db);
    await insertSegment(db, {
      id: segmentId,
      roadName: "BR-101",
      kmStart: 0,
      kmEnd: 1,
      lat: 0,
      lon: 0,
    });
    await db.db.execute(
      sql`INSERT INTO api_keys (id, name, source, key) VALUES (${randomUUID()}, 'runtime-test', 'iot', ${createHash("sha256").update(apiKey).digest("hex")})`,
    );
    apis = await Promise.all([start("api"), start("api")]);
    workers = await Promise.all([start("domain"), start("domain")]);
  }, 60000);
  afterAll(async () => {
    await Promise.all(children.map(stop));
    await db?.onModuleDestroy();
  }, 15000);
  const send = (url: string, eventId: string, lon = 0) =>
    fetch(`${url}/readings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        source: "iot",
        eventId,
        nodeId: "runtime-sensor",
        lat: 0,
        lon,
        heightCm: 70,
      }),
    });
  async function waitForOrder(segment: string): Promise<void> {
    for (let i = 0; i < 100; i++) {
      const rows = await db.db.execute(
        sql`SELECT id FROM work_orders WHERE segment_id = ${segment}`,
      );
      if (rows.length === 1) return;
      await pause(100);
    }
    throw new Error("Workers did not produce a work order");
  }
  it("preserves the HTTP response and produces one OS for duplicate ingestion across APIs", async () => {
    const responses = await Promise.all(apis.map((api) => send(api.url, "same-event")));
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const results = await Promise.all(responses.map((response) => response.json()));
    expect(results[0]).toEqual(results[1]);
    expect(Object.keys(results[0]).sort()).toEqual([
      "createdAt",
      "id",
      "score",
      "segmentId",
      "source",
    ]);
    await waitForOrder(segmentId);
    const [event] = await db.db.execute<{ payload: { correlationId: string } }>(
      sql`SELECT payload FROM outbox_events WHERE payload->>'segmentId' = ${segmentId}`,
    );
    expect(responses.map((response) => response.headers.get("x-request-id"))).toContain(
      event.payload.correlationId,
    );
    expect(await db.db.execute(sql`SELECT id FROM readings`)).toHaveLength(1);
    expect(await db.db.execute(sql`SELECT id FROM work_orders`)).toHaveLength(1);
  }, 15000);
  it("does not expose business controllers on worker replicas", async () => {
    expect((await fetch(`${workers[0].url}/work-orders`)).status).toBe(404);
    expect((await fetch(`${apis[0].url}/work-orders`)).status).toBe(401);
  });
  it("continues processing after one worker shuts down", async () => {
    await stop(workers[0].child);
    const nextSegment = randomUUID();
    await insertSegment(db, {
      id: nextSegment,
      roadName: "BR-101",
      kmStart: 10,
      kmEnd: 11,
      lat: 0,
      lon: 0.1,
    });
    expect((await send(apis[1].url, "after-worker-shutdown", 0.1)).status).toBe(201);
    await waitForOrder(nextSegment);
  }, 15000);
});
