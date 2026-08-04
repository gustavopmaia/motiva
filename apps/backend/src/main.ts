import { Logger, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { setupDocs } from "./common/docs";
import { GlobalExceptionFilter } from "./common/global-exception.filter";
import { createValidationPipe } from "./common/validation.pipe";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const frontendUrl = config.get<string>("FRONTEND_URL");
  app.enableCors(frontendUrl ? { origin: frontendUrl } : {});

  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalFilters(new GlobalExceptionFilter(config.get<string>("NODE_ENV") !== "production"));
  app.useGlobalPipes(createValidationPipe());
  setupDocs(app);

  const port = config.get<number>("PORT") ?? 3000;
  await app.listen(port, "0.0.0.0");

  Logger.log(`Backend running on port ${port}`, "Bootstrap");
}
bootstrap();
