const { Writable } = require("node:stream");
const { once } = require("node:events");
const { writeFileSync, mkdirSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const { monitorEventLoopDelay } = require("node:perf_hooks");
const {
  ReportRenderer,
  ARTESP_MONTHLY_CONTEXT,
} = require("../dist/src/modules/reporting/infrastructure/report-renderer");
const { jpeg } = require("../dist/src/test-photo");
async function main() {
  const count = 1000;
  const rows = Array.from({ length: count }, (_, i) => ({
    roadName: "BR-101",
    direction: "norte",
    kmStart: String(i),
    kmEnd: String(i + 1),
    location: "lateral",
    team: "Equipe",
    completedAt: new Date(),
    photoPath: `${i}.jpg`,
    photoHash: "fixture",
    photoValidationStatus: "missing_exif",
  }));
  let bytes = 0,
    photos = 0,
    firstChunkPhotos;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      bytes += chunk.length;
      firstChunkPhotos ??= photos;
      callback();
    },
  });
  const renderer = new ReportRenderer({
    get: async () => {
      photos++;
      await new Promise((resolve) => setImmediate(resolve));
      return jpeg;
    },
  });
  const finished = once(output, "finish"),
    started = performance.now(),
    cpu = process.cpuUsage();
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  await renderer.renderPdf(ARTESP_MONTHLY_CONTEXT("2026-09"), rows, output);
  await finished;
  await new Promise((resolve) => setTimeout(resolve, 20));
  loop.disable();
  const used = process.cpuUsage(cpu);
  const result = {
    at: new Date().toISOString(),
    node: process.version,
    rows: count,
    photos,
    pdfBytes: bytes,
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (used.user + used.system) / 1e6,
    maxRssMiB: process.resourceUsage().maxRSS / 1024,
    eventLoopDelayP99Ms: loop.percentile(99) / 1e6,
    firstChunkAfterPhotos: firstChunkPhotos,
    limitations:
      "Single renderer with synthetic 1px JPEG and asynchronous memory adapter; excludes SQL, S3 latency, real photo buffers, HTTP clients, and concurrent reports. Pages and rows remain buffered; do not derive production memory limits from this fixture.",
  };
  if (photos !== count || firstChunkPhotos >= count || bytes === 0)
    throw new Error("Report streaming invariant failed");
  const path = resolve(__dirname, "../../../docs/benchmarks/report-local.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
