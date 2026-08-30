import { Logger, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { parseCorsOrigins } from "./common/env";
import { setupDocs } from "./common/docs";
import { GlobalExceptionFilter } from "./common/global-exception.filter";
import { createValidationPipe } from "./common/validation.pipe";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // Substitui o logger interno do Nest pelo pino: dai em diante todo
  // `new Logger(...)`/`Logger.log(...)` (inclusive os ja existentes, ex.
  // GlobalExceptionFilter) sai em JSON estruturado sem precisar mudar
  // nenhum call-site.
  app.useLogger(app.get(PinoLogger));
  const config = app.get(ConfigService);

  const corsOrigins = parseCorsOrigins(config.get<string>("FRONTEND_URL"));
  app.enableCors(corsOrigins ? { origin: corsOrigins } : {});

  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalFilters(new GlobalExceptionFilter(config.get<string>("NODE_ENV") !== "production"));
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
  setupDocs(app);

  const port = config.get<number>("PORT") ?? 3000;
  await app.listen(port, "0.0.0.0");

  Logger.log(`Backend running on port ${port}`, "Bootstrap");
}
bootstrap();
