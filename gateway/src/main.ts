import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PUBLIC_API_SCHEMA, type PublicApiSchema } from '@etendosoftware/api-gateway-core';
import { AppModule } from './app.module.ts';
import { buildPerEntityOpenApiPaths } from './openapi/build-per-entity-paths.ts';
import { registerOpenApiRoutes } from './openapi/register-openapi-routes.ts';
import { configureJsonApiBodyParser } from './public-api/json-api-http.ts';

const gettingStartedDescription = `
## Getting started

Etendo Public API provides curated access to Base-window resources through a stable, versioned REST API. The public contract is intentionally smaller than the internal ERP model: only resources and fields present in this document are available.

### 1. Get an API key

Create an owned public API key in Etendo. The provisioning endpoint requires the user's
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
the pair for a short-lived Etendo session token and forwards the request to Etendo; callers do not need
to implement the OAuth2 \`client_credentials\` exchange themselves.

### 3. Make your first request

\`\`\`bash
curl https://app.etendo.ai/api/v1/product \\
  -H 'Authorization: Bearer <client-id>:<client-secret>' \\
  -H 'Accept: application/json'
\`\`\`

Use the operation list below to discover the available resources. Every response is filtered to the fields documented for that resource.

Not every Etendo window is published in this version. Windows of the finance, accounting, configuration and setup categories are left out until their public contract is curated; projects (the Service Project window, a finance window) are among them and are not available yet.

### 4. Understand a resource

Each resource corresponds to a business window in Etendo. The resource page explains what the window is used for, which operations are available, and which fields are public. The URL may use an internal entity name, but the documentation uses the functional name that users know.

### 5. Create and update records

Use \`POST\` on a collection to create a record. Use \`PUT\` or \`PATCH\` on \`/resource/{id}\` to update one. Use \`DELETE\` on \`/resource/{id}\` to remove one; it answers \`204 No Content\` without a body. Request fields must be writable in this document; unknown or read-only fields are rejected before the request reaches Etendo.

Send bodies as JSON:API: \`{"data": {"type": "<resource>", "attributes": {...}, "relationships": {"<name>": {"data": {"type": "<related-resource>", "id": "<id>"}}}}}\`. \`attributes\` and \`relationships\` are each optional, so a body may carry only relationships. A foreign key is always a relationship, never an attribute; \`{"data": null}\` clears it. A \`type\` or \`id\` that does not match the URL is refused with \`409\`. The \`Content-Type\` is \`application/vnd.api+json\` (or \`application/json\`); responses are \`application/vnd.api+json\`. A single-record response carries one resource object in \`data\`; a collection carries an array.

Updates use optimistic concurrency with standard HTTP preconditions. Reading, creating or updating a single record returns its version in the \`ETag\` header; every resource also carries it as \`meta.etag\`, including the items of a list. Send that value back in the \`If-Match\` header of \`PUT\` or \`PATCH\` (\`If-Match: *\` is not accepted): without it the request is refused with \`428 Precondition Required\`; if the record changed since it was read, it is refused with \`412 Precondition Failed\` and nothing is saved. Read the record again, reapply the change and retry. Successful writes return the new \`ETag\`.

### 6. Create lines for a document

Document lines are addressed through their master resource: \`/api/v1/{master}/{masterId}/{line-resource}\`. For example, create a sales-invoice line with \`POST /api/v1/sales-invoice/{masterId}/lines\`. The gateway derives the master foreign key from the URL and sends it to Etendo as \`parentId\`; clients must not override that relationship in the request body. The same nested path supports \`GET\`, \`POST\`, \`PUT\`, \`PATCH\`, and \`DELETE\` when the document contract exposes those operations.

### 7. Page, sort and filter lists

Collections accept \`page[number]\` (from 1) and \`page[size]\` (default 50, maximum 100), \`sort\` and \`filter[<field>]\`. Use public field names only; any unknown parameter, field or operator, or an invalid value, answers \`400\` with \`source.parameter\` naming the culprit.

- Pagination: \`GET /api/v1/contacts?page[number]=2&page[size]=25\`. The response carries \`meta.page\` (\`number\`, \`size\`, \`total\`) and \`links\` (\`self\`, \`first\`, \`prev\`, \`next\`, \`last\`) that keep your other query parameters.
- Sorting: \`sort=name,-search_key\` (a leading \`-\` is descending).
- Filtering: \`filter[name]=Acme\` (equals) or \`filter[<field>][<operator>]=<value>\` with \`eq\`, \`ne\`, \`gt\`, \`gte\`, \`lt\`, \`lte\`, \`contains\` (text only) and \`in\` (comma-separated list). Dates are \`yyyy-MM-dd\`; booleans are \`true\`/\`false\`. Up to 20 filters per request.

### Responses and errors

Every error is a JSON:API document: \`{"errors": [{"status": "404", "code": "...", "title": "Not Found", "detail": "<Etendo's message>", "meta": {"hint": "..."}}]}\`. \`detail\` carries Etendo's own message; \`code\` and \`meta.hint\` appear when Etendo provides them.

- \`200\` / \`201\`: the request completed; \`204\`: a record was deleted (no body).
- \`400\`: invalid input, unsupported field, invalid query parameter (see \`source.parameter\`), or invalid operation payload. A create or update missing mandatory fields answers one error per field, code \`missing_required_field\`, with \`source.pointer\` (\`/data/attributes/<name>\` or \`/data/relationships/<name>\`).
- \`401\`: missing, malformed, or invalid credentials. Error code: \`unauthorized\`.
- \`402\`: the tenant is blocked.
- \`403\`: the credential does not have the required scope or organization access.
- \`404\`: the resource or record does not exist. Error codes: \`not_found\`, \`unknown_action\`.
- \`406\` / \`415\`: the \`Accept\` or \`Content-Type\` header is not JSON:API (or JSON).
- \`409\`: the \`type\`/\`id\` does not match the URL, or the record is in use.
- \`412\`: the record changed since it was read (\`If-Match\` does not match its current version). Error codes: \`stale_record\` (the record changed), \`precondition_failed\` (\`If-Match\` is not a valid ETag).
- \`422\`: Etendo refused the request (validation).
- \`428\`: the update did not send \`If-Match\`. Error code: \`precondition_required\`.
- \`429\`: the API key exceeded its rate limit; wait \`Retry-After\` seconds.
- \`502\`: Etendo failed or could not complete the upstream request (any 5xx); no internal details are returned. When \`meta.hint\` is present the write may already be saved: read the record before re-sending.
- \`503\`: Etendo is temporarily unavailable; retry later.

### Versioning

The current contract is \`v1\` and is available under \`/api/v1\`. Additive fields may be introduced without changing the version. Removing or changing the meaning of a public field requires a new API version; previous versions remain available while supported.

### Rate limits

The gateway limits each API key to 100 requests per 60 seconds by default (the deployment may configure other values). Every response to an authenticated request carries \`X-RateLimit-Limit\` (requests allowed per window), \`X-RateLimit-Remaining\` (requests left in the current window) and \`X-RateLimit-Reset\` (seconds until the window resets). When the limit is exceeded the API answers \`429 Too Many Requests\` with a JSON:API error and a \`Retry-After\` header (seconds to wait). Requests rejected for a missing or invalid API key are not counted against any key.

This guide is English-only for the first release. The documentation model is prepared for localized versions in the future.
`;

async function bootstrap() {
  // The body parser is registered by hand so JSON:API bodies (application/vnd.api+json)
  // are read like application/json. Anything else is refused with 415 by the
  // public controller's negotiation guard before the body is used.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureJsonApiBodyParser(app as unknown as NestExpressApplication);
  app.setGlobalPrefix('api/v1');
  // Versions are announced only through the explicit ETag of a single record
  // (see PublicApiController). Express would otherwise add its own weak ETags
  // to every other response, which clients could mistake for one.
  app.getHttpAdapter().getInstance().set('etag', false);

  const config = new DocumentBuilder()
    .setTitle('Etendo Public API')
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
  registerOpenApiRoutes(app.getHttpAdapter(), document);

  const docsPage = (_req: unknown, res: { type: (contentType: string) => { send: (body: string) => void } }) => {
    const logoDataUri = `data:image/png;base64,${readFileSync(new URL('../public/logo-etendo.png', import.meta.url)).toString('base64')}`;
    res.type('html').send(`<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Etendo Public API · Beta</title>
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
  app.getHttpAdapter().get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  await app.listen(process.env.GATEWAY_PORT ?? 4300);
}
bootstrap();
