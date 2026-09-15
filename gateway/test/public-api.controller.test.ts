import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException, BadGatewayException } from '@nestjs/common';
import { PublicApiController } from '../src/public-api/public-api.controller.ts';
import type { PublicApiSchema } from '@etendosoftware/api-gateway-core';

const schema: PublicApiSchema = {
  apiVersion: 'v1',
  entities: {
    // specName ("contacts") deliberately differs from the entity key
    // ("businessPartner") — using product/product for this test would leave the
    // specName-vs-entityName bug undetectable (they're identical there). This is
    // exactly the shape that caught the real bug during ETP-5345 Task 15 manual
    // verification: the URL used entityName alone and NeoServlet returned its
    // metadata/discovery response instead of a { response: { data } } list.
    businessPartner: {
      publicApi: true,
      specName: 'contacts',
      operations: ['GET', 'LIST'],
      fields: {
        name: { publicApi: true, direction: 'out', internalPath: 'name', type: 'passthrough', handlerId: null },
      },
    },
  },
};

test('list() calls NeoServlet at /sws/neo/{specName}/{entityName} and unwraps the response envelope', async () => {
  const fakeFetch = async (url: string) => {
    assert.equal(url, 'http://neo.local/etendo/sws/neo/contacts/businessPartner');
    return new Response(
      JSON.stringify({ response: { data: [{ name: 'Widget', internalCostBasis: 99 }] } }),
      { status: 200 }
    );
  };
  const controller = new PublicApiController(schema, 'http://neo.local/etendo', fakeFetch as typeof fetch);
  const result = await controller.list('businessPartner', { neoJwt: 'jwt-abc' } as any);
  assert.deepEqual(result, [{ name: 'Widget' }]);
});

test('propagates a NeoServlet 401 as our own UnauthorizedException, not a raw parse crash', async () => {
  // NeoServlet correctly rejects an invalid/expired token with
  // { error: { message, status } }, not { response: { data } } — the
  // controller must check response.ok BEFORE assuming the success shape,
  // or json.response.data throws on undefined and NestJS turns that into an
  // opaque 500 that hides NeoServlet's real (correct) answer (ETP-5345).
  const fakeFetch = async () =>
    new Response(JSON.stringify({ error: { message: 'Invalid or expired token', status: 401 } }), { status: 401 });
  const controller = new PublicApiController(schema, 'http://neo.local/etendo', fakeFetch as typeof fetch);
  await assert.rejects(
    () => controller.list('businessPartner', { neoJwt: 'jwt-abc' } as any),
    UnauthorizedException
  );
});

test('propagates a NeoServlet 5xx as a BadGatewayException, not a raw parse crash', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 503 });
  const controller = new PublicApiController(schema, 'http://neo.local/etendo', fakeFetch as typeof fetch);
  await assert.rejects(
    () => controller.list('businessPartner', { neoJwt: 'jwt-abc' } as any),
    BadGatewayException
  );
});
