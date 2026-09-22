const ENVIRONMENTS = ["development", "test", "production"];
const MIN_SECRET_LENGTH = 16;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const role = String(config.BACKEND_ROLE ?? "all");
  for (const key of ["QUEUE_PREFIX", "MQTT_SHARED_GROUP"]) {
    if (config[key] !== undefined && !/^[a-zA-Z0-9_-]{1,100}$/.test(String(config[key])))
      throw new Error(`${key} must contain 1 to 100 letters, digits, underscores or hyphens`);
  }
  const needsAuth = ["api", "all"].includes(role);
  const required = ["DATABASE_URL", ...(needsAuth ? ["JWT_SECRET"] : []), "REDIS_URL"];
  const missing = required.filter((key) => !config[key]);
  if (role === "mqtt" && !config.MQTT_URL) missing.push("MQTT_URL");
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (needsAuth && String(config.JWT_SECRET).length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  const nodeEnv = config.NODE_ENV == null ? "development" : String(config.NODE_ENV);
  if (!ENVIRONMENTS.includes(nodeEnv)) {
    throw new Error(`NODE_ENV must be one of ${ENVIRONMENTS.join(", ")}`);
  }

  const port = config.PORT == null ? 3000 : Number(config.PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  if (!["all", "api", "domain", "images", "mqtt"].includes(role))
    throw new Error("BACKEND_ROLE must be all, api, domain, images, or mqtt");
  if (
    nodeEnv === "production" &&
    ["mqtt", "all"].includes(role) &&
    config.MQTT_URL &&
    !config.MQTT_CLIENT_ID
  )
    throw new Error("MQTT_CLIENT_ID must be a stable unique identity for each MQTT replica");
  const storage = String(config.STORAGE_DRIVER ?? "local");
  if (!["local", "s3"].includes(storage)) throw new Error("STORAGE_DRIVER must be local or s3");
  if (storage === "s3" && !config.S3_BUCKET)
    throw new Error("S3_BUCKET is required for S3 storage");
  if (nodeEnv === "production" && ["api", "images", "all"].includes(role) && storage !== "s3")
    throw new Error("Production API/image replicas require STORAGE_DRIVER=s3");
  const values: Record<string, number> = {};
  for (const [name, fallback, max] of [
    ["DB_POOL_MAX", 10, 100],
    ["DB_CONNECT_TIMEOUT_SECONDS", 10, 60],
    ["CLASSIFIER_TIMEOUT_MS", 30000, 120000],
    ["SEGMENT_MATCH_RADIUS_M", 500, 10000],
  ] as const) {
    const value = Number(config[name] ?? fallback);
    if (!Number.isInteger(value) || value <= 0 || value > max)
      throw new Error(`${name} must be an integer between 1 and ${max}`);
    values[name] = value;
  }
  return {
    ...config,
    ...values,
    NODE_ENV: nodeEnv,
    PORT: port,
    BACKEND_ROLE: role,
    STORAGE_DRIVER: storage,
  };
}

/**
 * FRONTEND_URL aceita uma lista separada por vírgula para que o front em produção e o
 * ambiente de desenvolvimento de quem está na equipe possam falar com a mesma API.
 * Sem nenhuma origem configurada o CORS fica liberado, que é o padrão do Nest.
 */
export function parseCorsOrigins(frontendUrl: string | undefined): string[] | undefined {
  const origins = (frontendUrl ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return origins.length > 0 ? origins : undefined;
}
