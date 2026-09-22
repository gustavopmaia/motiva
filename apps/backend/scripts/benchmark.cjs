// Local capacity experiment. Uses the same disposable database as integration tests.
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { createHash, randomUUID } = require("node:crypto");
const { resolve, dirname } = require("node:path");
const { mkdirSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const postgres = require("postgres");
const { Queue } = require("bullmq");

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const requestCount = Number(process.env.BENCH_REQUESTS ?? 2400);
const concurrency = Number(process.env.BENCH_CONCURRENCY ?? 32);
const output = resolve(__dirname, "../../../docs/benchmarks/backend-local.json");
const tables =
  "route_audit,api_key_audit,object_uploads,outbox_events,outbox_replay_audit,maintenance_audit,ingestion_rejections,dispatch_requests,vehicle_captures,work_order_photos,generated_reports,route_items,routes,work_orders,alerts,readings,team_members,teams,road_segments,password_reset_tokens,api_keys,users";
const children = new Set();
const queues = ["segment-events", "alert-events", "photo-classification"];
async function freePort() {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
async function start(role, prefix) {
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(__dirname, "../dist/src/main.js")], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      BACKEND_ROLE: role,
      PORT: String(port),
      LOG_LEVEL: "error",
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      REDIS_URL: process.env.TEST_REDIS_URL,
      JWT_SECRET: "local-benchmark-test-secret",
      DB_POOL_MAX: "5",
      MQTT_URL: "",
      STORAGE_DRIVER: "local",
      QUEUE_PREFIX: prefix,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  let logs = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (value) => {
      logs = (logs + value).slice(-3000);
    });
  const url = `http://127.0.0.1:${port}/api/v1`;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error(`Benchmark ${role} exited: ${logs}`);
    try {
      if ((await fetch(`${url}/health/ready`, { signal: AbortSignal.timeout(1000) })).ok)
        return { child, url };
    } catch {}
    await pause(100);
  }
  throw new Error(`Benchmark runtime did not start: ${logs}`);
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    children.delete(child);
    return;
  }
  await new Promise((resolve) => {
    const timeout = setTimeout(() => child.kill("SIGKILL"), 10000);
    child.once("exit", () => {
      clearTimeout(timeout);
      children.delete(child);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
const round = (value) => Math.round(value * 100) / 100;
const percentile = (sorted, p) =>
  round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0);
async function scenario(db, replicas, distribution) {
  await db.unsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  const key = randomUUID(),
    prefix = `bench-${randomUUID()}`;
  await db`INSERT INTO api_keys (id, name, source, key) VALUES (${randomUUID()}, 'benchmark', 'iot', ${createHash("sha256").update(key).digest("hex")})`;
  const segments = distribution === "distributed" ? 64 : 1;
  for (let i = 0; i < segments; i++) {
    const lon = i * 0.03;
    await db`INSERT INTO road_segments (id, road_name, km_start, km_end, geometry)
      VALUES (${randomUUID()}, 'BENCHMARK', ${i}, ${i + 1}, ST_SetSRID(ST_MakeLine(ST_MakePoint(${lon}, 0), ST_MakePoint(${lon + 0.01}, 0.01)), 4326))`;
  }
  await db.unsafe("ANALYZE road_segments");
  const processes = [];
  try {
    const apis = await Promise.all(Array.from({ length: replicas }, () => start("api", prefix)));
    processes.push(...apis);
    processes.push(
      ...(await Promise.all(Array.from({ length: replicas }, () => start("domain", prefix)))),
    );
    // Warm every API and its connection pool with below-threshold readings.
    for (const api of apis)
      await Promise.all(
        Array.from({ length: 32 }, (_, index) =>
          fetch(`${api.url}/readings`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": key },
            body: JSON.stringify({
              source: "iot",
              eventId: `warmup-${randomUUID()}`,
              nodeId: "warmup",
              lat: 0,
              lon: (index % segments) * 0.03,
              heightCm: 10,
            }),
          }).then(async (response) => {
            await response.arrayBuffer();
            if (response.status !== 201) throw new Error("Warmup failed");
          }),
        ),
      );
    await db.unsafe("TRUNCATE readings");
    await db.unsafe(
      "UPDATE road_segments SET score_current = NULL, risk_version = 0, risk_valid_until = NULL, risk_contributions = '[]'::jsonb",
    );
    let next = 0;
    const latency = [],
      statuses = {};
    const started = performance.now();
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (next < requestCount) {
          const index = next++,
            begin = performance.now();
          let status;
          try {
            const response = await fetch(`${apis[index % replicas].url}/readings`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": key },
              body: JSON.stringify({
                source: "iot",
                eventId: `bench-${index}`,
                nodeId: "benchmark",
                lat: 0,
                lon: (index % segments) * 0.03,
                heightCm: 65,
              }),
              signal: AbortSignal.timeout(30000),
            });
            await response.arrayBuffer();
            status = String(response.status);
          } catch {
            status = "network-error";
          }
          statuses[status] = (statuses[status] ?? 0) + 1;
          latency.push(performance.now() - begin);
        }
      }),
    );
    const ingestionSeconds = (performance.now() - started) / 1000;
    let orders = 0;
    for (let i = 0; i < 200; i++) {
      [{ count: orders }] = await db`SELECT count(*)::int AS count FROM work_orders`;
      if (orders === segments) break;
      await pause(100);
    }
    const [{ count: readings }] = await db`SELECT count(*)::int AS count FROM readings`;
    const [{ count: duplicateOrders }] =
      await db`SELECT count(*)::int AS count FROM (SELECT segment_id FROM work_orders GROUP BY segment_id HAVING count(*) > 1) duplicate`;
    latency.sort((a, b) => a - b);
    const result = {
      distribution,
      apiReplicas: replicas,
      domainReplicas: replicas,
      segments,
      requestCount,
      concurrency,
      warmupRequestsPerApi: 32,
      databasePoolPerProcess: 5,
      ingestionSeconds: round(ingestionSeconds),
      requestsPerSecond: round(requestCount / ingestionSeconds),
      latencyMs: {
        p50: percentile(latency, 0.5),
        p95: percentile(latency, 0.95),
        p99: percentile(latency, 0.99),
      },
      endToEndSeconds: round((performance.now() - started) / 1000),
      statuses,
      readings,
      orders,
      duplicateOrders,
    };
    console.log(JSON.stringify(result));
    if (
      statuses["201"] !== requestCount ||
      readings !== requestCount ||
      orders !== segments ||
      duplicateOrders !== 0
    )
      throw new Error(`Benchmark invariant failed: ${JSON.stringify(result)}`);
    return result;
  } finally {
    await Promise.all(processes.map(({ child }) => stop(child)));
    for (const name of queues) {
      const queue = new Queue(name, { connection: { url: process.env.TEST_REDIS_URL }, prefix });
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }
}
async function main() {
  if (
    !process.env.TEST_DATABASE_URL ||
    !process.env.TEST_REDIS_URL ||
    process.env.BENCH_CONFIRM_DISPOSABLE !== "1"
  )
    throw new Error(
      "Set TEST_DATABASE_URL, TEST_REDIS_URL and BENCH_CONFIRM_DISPOSABLE=1; the test database is truncated.",
    );
  if (
    !Number.isInteger(requestCount) ||
    requestCount < 64 ||
    requestCount > 10000 ||
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 128
  )
    throw new Error("Invalid benchmark request/concurrency limits");
  const db = postgres(process.env.TEST_DATABASE_URL, { max: 2, onnotice: () => {} });
  const result = {
    at: new Date().toISOString(),
    node: process.version,
    host: {
      platform: os.platform(),
      arch: os.arch(),
      cpu: os.cpus()[0].model,
      logicalCpus: os.cpus().length,
      memoryGiB: round(os.totalmem() / 1024 ** 3),
    },
    note: "Local synthetic experiment; Node processes share one host. PostGIS and Redis run in Docker. Measures ingestion and OS generation, not production SLO, image inference, or route planning capacity.",
    scenarios: [],
  };
  try {
    for (const distribution of ["distributed", "single-segment"])
      for (const replicas of [1, 2, 4]) {
        result.scenarios.push(await scenario(db, replicas, distribution));
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
      }
  } finally {
    await Promise.all([...children].map(stop));
    await db.unsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    await db.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
