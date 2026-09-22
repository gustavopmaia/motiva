const { spawnSync } = require("node:child_process");
const required = ["TEST_DATABASE_URL", "TEST_REDIS_URL", "TEST_S3_ENDPOINT", "TEST_MQTT_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Integration tests require a disposable environment: ${missing.join(", ")}`);
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  [require.resolve("jest/bin/jest"), "--testMatch", "**/*.int-spec.ts", "--runInBand"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
