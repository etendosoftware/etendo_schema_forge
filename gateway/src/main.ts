import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PUBLIC_API_SCHEMA, type PublicApiSchema } from '@etendosoftware/api-gateway-core';
import { AppModule } from './app.module.ts';
import { buildPerEntityOpenApiPaths } from './openapi/build-per-entity-paths.ts';

const gettingStartedDescription = `
## Getting started

Etendo Go Public API provides curated access to Base-window resources through a stable, versioned REST API. The public contract is intentionally smaller than the internal ERP model: only resources and fields present in this document are available.

### 1. Get an API key

Create an owned public API key in Etendo Go. The provisioning endpoint requires the user's
session JWT and accepts only public capabilities:

\`\`\`bash
curl -X POST http://localhost:3100/oauth2/api-keys \\
  -H "Authorization: Bearer <session-jwt>" \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Nest integration","capabilities":["public-api:read"]}'
\`\`\`

Store the returned \`clientId\` and \`clientSecret\` immediately. The secret is returned only by
the create/rotate response. The gateway accepts the pair as a bearer credential:

\`\`\`http
Authorization: Bearer <client-id>:<client-secret>
\`\`\`

API keys are scoped to the tenant, organization, role, and operations assigned to the client. The gateway rejects resources, verbs, and fields outside the published contract.

### 2. Authorize Scalar

Open \`/api\` or \`/docs\`, select **Authorize**, and enter the credential as:

\`\`\`text
<clientId>:<clientSecret>
\`\`\`

Scalar sends it as \`Authorization: Bearer <clientId>:<clientSecret>\`. The Nest gateway exchanges
the pair for a short-lived NEO token and forwards the request to Etendo Go; callers do not need
to implement the OAuth2 \`client_credentials\` exchange themselves.

### 3. Make your first request

\`\`\`bash
curl https://app.etendo.ai/api/v1/product \\
  -H 'Authorization: Bearer <client-id>:<client-secret>' \\
  -H 'Accept: application/json'
\`\`\`

Use the operation list below to discover the available resources. Every response is filtered to the fields documented for that resource.

### 4. Understand a resource

Each resource corresponds to a business window in Etendo Go. The resource page explains what the window is used for, which operations are available, and which fields are public. The URL may use an internal entity name, but the documentation uses the functional name that users know.

### 5. Create and update records

Use \`POST\` on a collection to create a record. Use \`PUT\` or \`PATCH\` on \`/resource/{id}\` to update one. Use \`DELETE\` on \`/resource/{id}\` to remove one. Request fields must be writable in this document; unknown or read-only fields are rejected before the request reaches Etendo Go.

Updates use optimistic concurrency. Include the \`updated\` value returned by a previous read when the resource requires it; a stale value returns \`409 Conflict\`.

### 6. Create lines for a document

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

  const docsPage = (_req: unknown, res: { type: (contentType: string) => { send: (body: string) => void } }) => {
    const logoDataUri = `data:image/png;base64,${readFileSync(new URL('../public/logo-etendo.png', import.meta.url)).toString('base64')}`;
    res.type('html').send(`<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Etendo Go Public API · Beta</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #f7f8fa; color: #20232a; }
    .etendo-shell { position: static; }
    .etendo-header { align-items: center; background: #fff; border-bottom: 1px solid #e5e7eb; display: flex; gap: 18px; min-height: 68px; padding: 0 32px; }
    .etendo-header img { height: 32px; width: auto; }
    .etendo-title { border-left: 1px solid #d9dde3; font-size: 16px; font-weight: 600; padding-left: 18px; }
    .etendo-beta { background: #fff3cd; border: 1px solid #f0c36d; border-radius: 999px; color: #7a4b00; font-size: 11px; font-weight: 700; letter-spacing: .08em; padding: 4px 9px; }
    .etendo-notice { background: #eef6ff; border-bottom: 1px solid #cfe3f8; color: #244767; font-size: 14px; padding: 11px 32px; }
    @media (max-width: 640px) { .etendo-header { padding: 0 18px; } .etendo-title { font-size: 14px; } .etendo-notice { padding: 11px 18px; } }
  </style>
</head><body>
  <div class="etendo-shell">
    <header class="etendo-header">
      <img src="${logoDataUri}" alt="Etendo">
      <span class="etendo-title">Go Public API</span>
      <span class="etendo-beta">BETA</span>
    </header>
    <div class="etendo-notice">This API is in beta. The contract and limits may change while the public API is being validated.</div>
  </div>
  <script id="api-reference" data-url="/api/openapi.json" data-configuration='{"theme":"default","darkMode":false}'></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body></html>`);
  };
  // /api is the public production documentation entrypoint. It intentionally
  // has no app-session guard; data operations under /api/v1 still require an
  // API key through PublicApiKeyGuard.
  app.getHttpAdapter().get('/api', docsPage);
  app.getHttpAdapter().get('/docs', docsPage);
  app.getHttpAdapter().get('/api/openapi.json', (_req, res) => res.json(document));
  app.getHttpAdapter().get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  await app.listen(process.env.GATEWAY_PORT ?? 4300);
}
bootstrap();
