import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

type JsonResponse = {
  json(body: unknown): void;
};

type HtmlResponse = {
  type(contentType: string): HtmlResponse;
  send(body: string): void;
};

export function setupDocs(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Motiva API")
    .setDescription(
      "HTTP API for Motiva vegetation monitoring, reading ingestion, alert tracking, and work order management.",
    )
    .setVersion("1.0.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT access token returned by the login endpoint.",
      },
      "jwt",
    )
    .addApiKey(
      {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Ingestion API key used by trusted reading sources.",
      },
      "api-key",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const adapter = app.getHttpAdapter();

  adapter.get("/api/docs-json", (_request: unknown, response: JsonResponse) => {
    response.json(document);
  });

  adapter.get("/api/docs", (_request: unknown, response: HtmlResponse) => {
    response.type("text/html").send(renderRedoc(document));
  });
}

function renderRedoc(document: OpenAPIObject): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${document.info.title}</title>
    <style>
      body {
        margin: 0;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <redoc spec-url="/api/docs-json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`;
}
