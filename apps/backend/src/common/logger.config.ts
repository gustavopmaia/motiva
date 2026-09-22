import { ConfigService } from "@nestjs/config";
import { Params } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import { stdTimeFunctions } from "pino";

// LOG_LEVEL controla ruido/custo de disco por ambiente: "debug" gera muito
// mais volume no Loki do que vale a pena manter em producao. Default "info".
export function createLoggerConfig(config: ConfigService): Params {
  return {
    pinoHttp: {
      level: config.get<string>("LOG_LEVEL") ?? "info",
      timestamp: stdTimeFunctions.isoTime,
      redact: {
        paths: [
          "req.headers.authorization",
          'req.headers["x-api-key"]',
          "req.headers.cookie",
          'res.headers["set-cookie"]',
        ],
        censor: "[REDACTED]",
      },
      // Respeita x-request-id de entrada (ex.: veio de um proxy/gateway
      // upstream); gera um novo so quando a requisicao chega sem nenhum,
      // e devolve o mesmo valor no header de resposta para correlacionar
      // ponta a ponta.
      genReqId: (req, res) => {
        const existing = req.headers["x-request-id"];
        const candidate = Array.isArray(existing) ? existing[0] : existing;
        const id =
          candidate && /^[a-zA-Z0-9_.:-]{1,128}$/.test(candidate) ? candidate : randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      // O NODE_ENV!=production do GlobalExceptionFilter ja decide status
      // code e stack trace; aqui so silencia o log de acesso automatico do
      // pino-http para rotas de infraestrutura sem valor de auditoria.
      autoLogging: {
        ignore: (req) => req.url === "/api/v1/health" || req.url === "/api/v1/metrics",
      },
    },
  };
}
