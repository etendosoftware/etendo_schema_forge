import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.ts';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Etendo Go Public API')
    .setVersion('v1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
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
