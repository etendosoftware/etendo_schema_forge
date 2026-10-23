// @covers gateway/src/public-api/json-api-http.ts
// @covers gateway/src/public-api/public-api.controller.ts
import 'reflect-metadata';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import {
  BadRequestException,
  Logger,
  Module,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CachedTokenExchangeService, PUBLIC_API_SCHEMA, type PublicApiSchema } from '@etendosoftware/api-gateway-core';
import { PublicApiController } from '../src/public-api/public-api.controller.ts';
import {
  acceptsJsonApi,
  configureJsonApiBodyParser,
  isSupportedContentType,
  parseUpstreamError,
  toErrorDocument,
  upstreamException,
} from '../src/public-api/json-api-http.ts';

Logger.overrideLogger(false);

test('Accept: absent, wildcard, json and an explicit JSON:API type are answered', () => {
  for (const accept of [undefined, '', '*/*', 'application/*', 'application/json', 'application/vnd.api+json', 'text/html, application/vnd.api+json;q=0.9', 'application/vnd.api+json; ext="https://example.com/x"']) {
    assert.equal(acceptsJsonApi(accept), true, String(accept));
  }
});

test('Accept: 406 only when no entry is JSON, a wildcard or a JSON:API type without unsupported parameters', () => {
  for (const accept of ['text/html', 'application/xml', 'application/vnd.api+json; charset=utf-8', 'application/vnd.api+json;q=0, application/xml']) {
    assert.equal(acceptsJsonApi(accept), false, accept);
  }
  // An unsupported parameter on the JSON:API entry is fine while another entry is acceptable.
  assert.equal(acceptsJsonApi('application/vnd.api+json; charset=utf-8, application/json'), true);
});

test('Content-Type: JSON and bare JSON:API are read; a JSON:API type with parameters or another type is refused', () => {
  for (const type of [undefined, 'application/json', 'application/json; charset=utf-8', 'application/vnd.api+json', 'application/vnd.api+json; profile="https://example.com/p"']) {
    assert.equal(isSupportedContentType(type), true, String(type));
  }
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/vnd.api+json; charset=utf-8', 'application/vnd.api+json; version=2']) {
    assert.equal(isSupportedContentType(type), false, type);
  }
});

test('configureJsonApiBodyParser makes the JSON parser read application/vnd.api+json too', () => {
  const calls: unknown[][] = [];
  configureJsonApiBodyParser({ useBodyParser: (...args: unknown[]) => calls.push(args) } as any);
  assert.deepEqual(calls, [['json', { type: ['application/json', 'application/vnd.api+json'] }]]);
});

test('parseUpstreamError reads the nested and the flat Etendo shapes and tolerates garbage', () => {
  assert.deepEqual(parseUpstreamError({ error: { message: 'm', status: 400 } }), { code: undefined, message: 'm', detail: undefined, hint: undefined, field: undefined });
  assert.deepEqual(
    parseUpstreamError({ status: 400, error: 'missing_updated', message: 'm', detail: 'd', hint: 'h', field: 'updated' }),
    { code: 'missing_updated', message: 'm', detail: 'd', hint: 'h', field: 'updated' },
  );
  for (const garbage of [null, undefined, 'text', 42, [], { error: 7 }]) {
    assert.deepEqual(parseUpstreamError(garbage), { code: undefined, message: undefined, detail: undefined, hint: undefined, field: undefined });
  }
});

test('upstreamException forwards the meaningful 4xx and turns everything else into a 502', () => {
  for (const status of [400, 401, 402, 403, 404, 409, 412, 422, 428, 429, 503]) {
    assert.equal(upstreamException(status, null).getStatus(), status);
  }
  for (const status of [301, 405, 418, 500, 501]) {
    assert.equal(upstreamException(status, { error: { message: 'secret internals' } }).getStatus(), 502);
  }
});

test('upstreamException keeps the code and message of a 503 service_unavailable', () => {
  const error = upstreamException(503, { error: { status: 503, code: 'service_unavailable', message: 'Service temporarily unavailable' } });
  assert.equal(error.getStatus(), 503);
  const { errors } = toErrorDocument(error);
  assert.equal(errors[0].code, 'service_unavailable');
  assert.equal(errors[0].detail, 'Service temporarily unavailable');
});

test('upstreamException turns a 500 with an after-commit hint into a 502 carrying meta.hint, not Retry later', () => {
  const hint = 'The record may already be saved. Read it before re-sending the request.';
  const { status, errors } = toErrorDocument(upstreamException(500, { error: { status: 500, message: 'ORA-00001 internal secret', hint } }));
  assert.equal(status, 502);
  assert.deepEqual(errors[0].meta, { upstreamStatus: 500, hint });
  assert.match(errors[0].detail ?? '', /Check meta\.hint/);
  assert.doesNotMatch(JSON.stringify(errors), /Retry later|ORA-00001|secret/);
});

test('upstreamException keeps the generic retry 502 for a 500 without a hint', () => {
  const { status, errors } = toErrorDocument(upstreamException(500, { error: { status: 500, message: 'internal secret' } }));
  assert.equal(status, 502);
  assert.deepEqual(errors[0].meta, { upstreamStatus: 500 });
  assert.match(errors[0].detail ?? '', /Retry later/);
  assert.doesNotMatch(JSON.stringify(errors), /secret/);
});

test('toErrorDocument renders gateway and Nest exceptions as error documents without leaking unknown errors', () => {
  assert.deepEqual(toErrorDocument(new UnauthorizedException('Missing API key')), {
    status: 401,
    errors: [{ status: '401', title: 'Unauthorized', detail: 'Missing API key' }],
  });
  assert.deepEqual(toErrorDocument(new ServiceUnavailableException('Authentication service unavailable')), {
    status: 503,
    errors: [{ status: '503', title: 'Service Unavailable', detail: 'Authentication service unavailable' }],
  });
  const many = toErrorDocument(new BadRequestException({ message: ['a is required', 'b is invalid'] }));
  assert.deepEqual(many.errors.map((error) => error.detail), ['a is required', 'b is invalid']);
  const unexpected = toErrorDocument(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'));
  assert.equal(unexpected.status, 500);
  assert.doesNotMatch(JSON.stringify(unexpected), /ECONNREFUSED|hunter2/);
});

// ---- Over real HTTP: a Nest app with the real controller -------------------

const schema: PublicApiSchema = {
  apiVersion: 'v1',
  entities: {
    product: {
      publicApi: true,
      specName: 'product',
      operations: ['GET', 'LIST', 'POST', 'DELETE'],
      fields: {
        name: { publicApi: true, direction: 'inout', internalPath: 'name', type: 'passthrough', handlerId: null },
      },
    },
  },
};

// The real PublicApiKeyGuard runs; only the token exchange behind it is faked.
const fakeTokenExchange = {
  getJwtForApiKey: async () => 'jwt',
  evictJwt: () => undefined,
};

let neoStatus = 200;
let neoBody: unknown = { response: { data: [{ id: 'p-1', name: 'Widget' }] } };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url).startsWith('http://neo.local')) {
    return new Response(neoBody === null ? null : JSON.stringify(neoBody), { status: neoStatus });
  }
  return realFetch(url, init);
}) as typeof fetch;
process.env.NEO_BASE_URL = 'http://neo.local/etendo';

@Module({
  controllers: [PublicApiController],
  providers: [
    { provide: PUBLIC_API_SCHEMA, useValue: schema },
    { provide: CachedTokenExchangeService, useValue: fakeTokenExchange },
  ],
})
class TestModule {}

const app = await NestFactory.create(TestModule, { bodyParser: false });
configureJsonApiBodyParser(app as any);
app.setGlobalPrefix('api/v1');
app.getHttpAdapter().get('/healthz', (_req: unknown, res: { json(body: unknown): void }) => res.json({ status: 'ok' }));
await app.listen(0);
const base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
after(async () => {
  globalThis.fetch = realFetch;
  await app.close();
});

async function call(path: string, init: RequestInit = {}) {
  const response = await realFetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: 'Bearer id:secret', ...(init.headers as Record<string, string> | undefined) },
  });
  const text = await response.text();
  return { status: response.status, type: response.headers.get('content-type'), text, json: text ? JSON.parse(text) : undefined };
}

test('HTTP: a successful read is application/vnd.api+json without media-type parameters', async () => {
  neoStatus = 200;
  neoBody = { response: { data: [{ id: 'p-1', name: 'Widget' }] } };
  const result = await call('/api/v1/product/p-1');
  assert.equal(result.status, 200);
  assert.equal(result.type, 'application/vnd.api+json');
  assert.equal(result.json.data.id, 'p-1');
  assert.ok(!Array.isArray(result.json.data));
});

test('HTTP: an error is an errors document with the Etendo message and the JSON:API content type', async () => {
  neoStatus = 409;
  neoBody = { status: 409, error: 'stale_record', message: 'Record changed', hint: 'Read it again.' };
  const result = await call('/api/v1/product/p-1');
  assert.equal(result.status, 409);
  assert.equal(result.type, 'application/vnd.api+json');
  assert.deepEqual(result.json, {
    errors: [{ status: '409', code: 'stale_record', title: 'Conflict', detail: 'Record changed', meta: { hint: 'Read it again.' } }],
  });
});

test('HTTP: DELETE answers 204 with an empty body and no Content-Type', async () => {
  neoStatus = 204;
  neoBody = null;
  const result = await call('/api/v1/product/p-1', { method: 'DELETE' });
  assert.equal(result.status, 204);
  assert.equal(result.text, '');
  assert.equal(result.type, null);
});

test('HTTP: a JSON:API body is read, and a vnd.api+json body with parameters is refused with 415', async () => {
  neoStatus = 201;
  neoBody = { response: { data: [{ id: 'p-2', name: 'New' }] } };
  const created = await call('/api/v1/product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.api+json' },
    body: JSON.stringify({ data: { type: 'product', attributes: { name: 'New' } } }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.attributes.name, 'New');

  const refused = await call('/api/v1/product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.api+json; charset=utf-8' },
    body: '{}',
  });
  assert.equal(refused.status, 415);
  assert.equal(refused.json.errors[0].status, '415');
  const text = await call('/api/v1/product', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(text.status, 415);
});

test('HTTP: an Accept that excludes JSON answers 406 as an error document', async () => {
  const result = await call('/api/v1/product', { headers: { Accept: 'text/html' } });
  assert.equal(result.status, 406);
  assert.equal(result.type, 'application/vnd.api+json');
  assert.equal(result.json.errors[0].title, 'Not Acceptable');
});

test('HTTP: PublicApiKeyGuard failures keep their status and become error documents', async () => {
  const missing = await realFetch(`${base}/api/v1/product`);
  assert.equal(missing.status, 401);
  assert.equal(missing.headers.get('content-type'), 'application/vnd.api+json');
  assert.equal(((await missing.json()) as any).errors[0].detail, 'Missing API key');
  const malformed = await call('/api/v1/product', { headers: { Authorization: 'Bearer no-colon' } });
  assert.equal(malformed.status, 401);
  assert.equal(malformed.json.errors[0].detail, 'Malformed API key');
});

test('HTTP: routes outside the public controller keep their own shape and content type', async () => {
  const health = await call('/healthz');
  assert.equal(health.status, 200);
  assert.match(health.type ?? '', /^application\/json/);
  assert.deepEqual(health.json, { status: 'ok' });
  const unknown = await call('/nope');
  assert.equal(unknown.status, 404);
  assert.match(unknown.type ?? '', /^application\/json/);
  assert.equal(unknown.json.errors, undefined);
  assert.equal(unknown.json.statusCode, 404);
});
