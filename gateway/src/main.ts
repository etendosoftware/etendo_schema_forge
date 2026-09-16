import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PUBLIC_API_SCHEMA, type PublicApiSchema } from '@etendosoftware/api-gateway-core';
import { AppModule } from './app.module.ts';
import { buildPerEntityOpenApiPaths } from './openapi/build-per-entity-paths.ts';

const gettingStartedDescription = `
## Getting started

Etendo Go Public API provides curated access to Base-window resources through a stable, versioned REST API. The public contract is intentionally smaller than the internal ERP model: only resources and fields present in this document are available.

### 1. Get an API key

Create an API client in Etendo Go and assign it the required scope. Keep the client secret private; it is shown only once. Send the resulting credential in the Authorization header:

\`\`\`http
Authorization: Bearer <client-id>:<client-secret>
\`\`\`

API keys are scoped to the tenant, organization, role, and operations assigned to the client. The gateway rejects resources, verbs, and fields outside the published contract.

### 2. Make your first request

\`\`\`bash
curl https://app.etendo.software/api/v1/product \\
  -H 'Authorization: Bearer <client-id>:<client-secret>' \\
  -H 'Accept: application/json'
\`\`\`

Use the operation list below to discover the available resources. Every response is filtered to the fields documented for that resource.

### 3. Understand a resource

Each resource corresponds to a business window in Etendo Go. The resource page explains what the window is used for, which operations are available, and which fields are public. The URL may use an internal entity name, but the documentation uses the functional name that users know.

### 4. Create and update records

Use \`POST\` on a collection to create a record. Use \`PUT\` or \`PATCH\` on \`/resource/{id}\` to update one. Use \`DELETE\` on \`/resource/{id}\` to remove one. Request fields must be writable in this document; unknown or read-only fields are rejected before the request reaches Etendo Go.

Updates use optimistic concurrency. Include the \`updated\` value returned by a previous read when the resource requires it; a stale value returns \`409 Conflict\`.

### 5. Create lines for a document

Document lines are addressed through their master resource: \`/api/v1/{master}/{masterId}/{line-resource}\`. For example, create a sales-invoice line with \`POST /api/v1/sales-invoice/{masterId}/lines\`. The gateway derives the master foreign key from the URL and sends it to Etendo Go as \`parentId\`; clients must not override that relationship in the request body. The same nested path supports \`GET\`, \`POST\`, \`PUT\`, \`PATCH\`, and \`DELETE\` when the document contract exposes those operations.

### Responses and errors

- \`2xx\`: request completed successfully.
- \`400\`: invalid input, unsupported field, or invalid operation payload.
- \`401\`: missing, malformed, or invalid credentials.
- \`403\`: the credential does not have the required scope or organization access.
- \`404\`: the resource or record does not exist.
- \`409\`: the record changed since it was read.
- \`502\`: Etendo Go could not complete the upstream request.

### Versioning

The current contract is \`v1\` and is available under \`/api/v1\`. Additive fields may be introduced without changing the version. Removing or changing the meaning of a public field requires a new API version; previous versions remain available while supported.

### Rate limits

The local gateway currently applies a default limit of 100 requests per 60 seconds per client process. Production limits may be configured independently and are part of the deployment contract.

This guide is English-only for the first release. The documentation model is prepared for localized versions in the future.
`;

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
  document.info.description = gettingStartedDescription;
  document.paths = buildPerEntityOpenApiPaths(schema);
  const usedTags = new Set(
    Object.values(document.paths).flatMap((path) =>
      Object.values(path).flatMap((operation) => operation.tags ?? []),
    ),
  );
  document.tags = Object.entries(schema.entities).map(([entityName, entity]) => {
    const functional = (entity as PublicApiSchema['entities'][string] & {
      functional?: { functionalName?: string; functionalSummary?: string; functionalCapabilities?: string[]; functionalDoc?: string | null };
    }).functional;
    return {
      name: functional?.functionalName ?? entityName,
      description: [
        functional?.functionalName,
        functional?.functionalSummary,
        functional?.functionalCapabilities?.length
          ? `Key capabilities:\n${functional.functionalCapabilities.map((capability) => `- ${capability}`).join('\n')}`
          : undefined,
        `CRUD operations for the public ${entityName} resource.`,
      ].filter(Boolean).join('\n\n'),
    };
  }).filter((tag) => usedTags.has(tag.name));
  app.getHttpAdapter().get('/api/v1/openapi.json', (_req, res) => {
    // Scalar must not keep an older generated contract after a local
    // regeneration; the schema is deployment content, not a cacheable API
    // response during development.
    res.setHeader('Cache-Control', 'no-store');
    return res.json(document);
  });

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
