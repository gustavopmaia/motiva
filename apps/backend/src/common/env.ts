const REQUIRED = ["DATABASE_URL", "JWT_SECRET", "REDIS_URL"] as const;
const ENVIRONMENTS = ["development", "test", "production"];
const MIN_SECRET_LENGTH = 16;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (String(config.JWT_SECRET).length < MIN_SECRET_LENGTH) {
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

  return { ...config, NODE_ENV: nodeEnv, PORT: port };
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
