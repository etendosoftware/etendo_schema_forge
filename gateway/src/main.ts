import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PUBLIC_API_SCHEMA, type PublicApiSchema } from '@etendosoftware/api-gateway-core';
import { AppModule } from './app.module.ts';
import { buildPerEntityOpenApiPaths } from './openapi/build-per-entity-paths.ts';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Etendo Go Public API')
    .setVersion('v1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // The real HTTP routing stays ONE dynamic @Get(':entityName') handler (no
  // generated code per entity, per the plan's Global Constraints) — but that
  // leaves Swagger auto-generating a single generic '/api/v1/{entityName}' path
  // with no real schema. Post-process the document instead: replace it with an
  // explicit path per curated entity, each carrying its actual public field
  // names, built from the same PublicApiSchema the app already loaded.
  const schema = app.get<PublicApiSchema>(PUBLIC_API_SCHEMA);
  document.paths = buildPerEntityOpenApiPaths(schema);
  app.getHttpAdapter().get('/api/v1/openapi.json', (_req, res) => res.json(document));

  app.getHttpAdapter().get('/docs', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html><head><title>Etendo Go Public API Docs</title></head>
<body>
  <script id="api-reference" data-url="/api/v1/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body></html>`);
  });

  await app.listen(process.env.GATEWAY_PORT ?? 4300);
}
bootstrap();
