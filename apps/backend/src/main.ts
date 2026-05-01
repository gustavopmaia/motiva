import { Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { setupDocs } from "@infrastructure/http/docs";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*'
  });
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  setupDocs(app);

  const port = process.env.PORT || 3000;
  await app.listen(port, "0.0.0.0");

  Logger.log(`Backend running on port ${port}`, "Bootstrap");
}
bootstrap();
