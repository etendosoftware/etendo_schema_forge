// @covers gateway/src/openapi/register-openapi-routes.ts
// @covers gateway/src/public-api/public-api-throttler.guard.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerOpenApiRoutes } from '../../src/openapi/register-openapi-routes.ts';
import { rateLimitConfig } from '../../src/public-api/public-api-throttler.guard.ts';

test('both OpenAPI routes answer the document with Cache-Control: no-cache', () => {
  const routes = new Map<string, (req: unknown, res: any) => unknown>();
  const document = { openapi: '3.0.0' };
  registerOpenApiRoutes({ get: (path, handler) => routes.set(path, handler) }, document);
  assert.deepEqual([...routes.keys()], ['/api/v1/openapi.json', '/api/openapi.json']);
  for (const handler of routes.values()) {
    const headers: Record<string, string> = {};
    let body: unknown;
    handler({}, { setHeader: (name: string, value: string) => { headers[name] = value; }, json: (value: unknown) => { body = value; } });
    assert.deepEqual(headers, { 'Cache-Control': 'no-cache' });
    assert.equal(body, document);
  }
});

test('the rate limit defaults to 100 requests per 60 s and reads valid overrides from the environment', () => {
  assert.deepEqual(rateLimitConfig({}), { limit: 100, ttl: 60_000 });
  assert.deepEqual(rateLimitConfig({ PUBLIC_API_RATE_LIMIT: '250', PUBLIC_API_RATE_WINDOW_SECONDS: '30' }), { limit: 250, ttl: 30_000 });
  for (const bad of ['0', '-5', 'abc', '1.5', '']) {
    assert.deepEqual(rateLimitConfig({ PUBLIC_API_RATE_LIMIT: bad, PUBLIC_API_RATE_WINDOW_SECONDS: bad }), { limit: 100, ttl: 60_000 }, bad);
  }
});
