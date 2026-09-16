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
        category: {
          publicApi: true, direction: 'out', internalPath: 'category', type: 'passthrough', handlerId: null,
          relationship: { resource: 'product-category', cardinality: 'one', foreignKey: 'category' },
        } as any,
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
  assert.deepEqual(result, { data: [{ type: 'businessPartner', attributes: { name: 'Widget' } }] });
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

test('maps writable public field names to NeoServlet internal paths for create', async () => {
  const crudSchema = structuredClone(schema);
  crudSchema.entities.businessPartner.operations = ['GET', 'LIST', 'POST'];
  crudSchema.entities.businessPartner.fields.taxId = {
    publicApi: true, direction: 'inout', internalPath: 'taxID', type: 'passthrough', handlerId: null,
  };
  let captured: RequestInit | undefined;
  const fakeFetch = async (_url: string, init?: RequestInit) => {
    captured = init;
    return new Response(JSON.stringify({ response: { data: { name: 'Acme', taxID: 'AR-1' } } }), { status: 200 });
  };
  const controller = new PublicApiController(crudSchema, 'http://neo.local/etendo', fakeFetch as typeof fetch);
  const result = await controller.create('businessPartner', { taxId: 'AR-1' }, { neoJwt: 'jwt-abc' } as any);
  assert.deepEqual(result, { data: { type: 'businessPartner', attributes: { name: 'Acme', taxId: 'AR-1' } } });
  assert.deepEqual(JSON.parse(String(captured?.body)), { taxID: 'AR-1' });
});

test('renders a public foreign key as a JSON:API relationship linkage', async () => {
  const fakeFetch = async () => new Response(
    JSON.stringify({ response: { data: { name: 'Widget', category: { id: 'cat-1', name: 'Retail' } } } }),
    { status: 200 },
  );
  const controller = new PublicApiController(schema, 'http://neo.local/etendo', fakeFetch as typeof fetch);
  const result = await controller.list('businessPartner', { neoJwt: 'jwt-abc' } as any);
  assert.deepEqual(result, {
    data: {
      type: 'businessPartner',
      attributes: { name: 'Widget' },
      relationships: {
        category: {
          data: { type: 'product-category', id: 'cat-1' },
          links: { related: '/api/v1/product-category/cat-1' },
        },
      },
    },
  });
});

test('rejects a CRUD operation absent from the external manifest', async () => {
  await assert.rejects(
    () => new PublicApiController(schema, 'http://neo.local/etendo', fetch).create('businessPartner', {}, { neoJwt: 'jwt-abc' } as any),
    /Operation POST is not exposed/,
  );
});

test('creates a child line through the master route and forwards parentId to NeoServlet', async () => {
  const childSchema = structuredClone(schema) as any;
  childSchema.entities.businessPartner.operations = ['GET', 'LIST'];
  childSchema.entities['contact-lines'] = {
    publicApi: true,
    publicName: 'contact-lines',
    specName: 'contacts',
    entityName: 'locationAddress',
    operations: ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'],
    parent: { resource: 'businessPartner', entityName: 'businessPartner', pathSegment: 'locations', foreignKey: 'businessPartner' },
    fields: {
      phone: { publicApi: true, direction: 'inout', internalPath: 'phone', type: 'passthrough', handlerId: null },
    },
  };
  let capturedUrl = '';
  let capturedBody = '';
  const fakeFetch = async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedBody = String(init?.body);
    return new Response(JSON.stringify({ response: { data: { id: 'line-1', phone: '555' } } }), { status: 200 });
  };
  const controller = new PublicApiController(childSchema, 'http://neo.local/etendo', fakeFetch as typeof fetch);
  await controller.createChild('businessPartner', 'bp-1', 'locations', { phone: '555' }, { neoJwt: 'jwt-abc' } as any);
  assert.equal(capturedUrl, 'http://neo.local/etendo/sws/neo/contacts/locationAddress?parentId=bp-1');
  assert.deepEqual(JSON.parse(capturedBody), { phone: '555', parentId: 'bp-1' });
});

test('routes every child CRUD verb through the master path and preserves the parent scope', async () => {
  const childSchema = structuredClone(schema) as any;
  childSchema.entities['contact-lines'] = {
    publicApi: true,
    publicName: 'contact-lines',
    specName: 'contacts',
    entityName: 'locationAddress',
    operations: ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'],
    parent: { resource: 'businessPartner', entityName: 'businessPartner', pathSegment: 'locations', foreignKey: 'businessPartner' },
    fields: {
      phone: { publicApi: true, direction: 'inout', internalPath: 'phone', type: 'passthrough', handlerId: null },
    },
  };
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fakeFetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    return new Response(init?.method === 'DELETE' ? null : JSON.stringify({ response: { data: { id: 'line-1', phone: '555' } } }), {
      status: init?.method === 'DELETE' ? 204 : 200,
    });
  };
  const controller = new PublicApiController(childSchema, 'http://neo.local/etendo', fakeFetch as typeof fetch);
  const request = { neoJwt: 'jwt-abc' } as any;

  await controller.listChild('businessPartner', 'bp-1', 'locations', request);
  await controller.createChild('businessPartner', 'bp-1', 'locations', { phone: '555' }, request);
  await controller.updateChild('businessPartner', 'bp-1', 'locations', 'line-1', { phone: '556' }, request);
  await controller.patchChild('businessPartner', 'bp-1', 'locations', 'line-1', { phone: '557' }, request);
  await controller.removeChild('businessPartner', 'bp-1', 'locations', 'line-1', request);

  assert.deepEqual(calls.map(({ url, method }) => ({ url, method })), [
    { url: 'http://neo.local/etendo/sws/neo/contacts/locationAddress?parentId=bp-1', method: 'GET' },
    { url: 'http://neo.local/etendo/sws/neo/contacts/locationAddress?parentId=bp-1', method: 'POST' },
    { url: 'http://neo.local/etendo/sws/neo/contacts/locationAddress/line-1?parentId=bp-1', method: 'PUT' },
    { url: 'http://neo.local/etendo/sws/neo/contacts/locationAddress/line-1?parentId=bp-1', method: 'PATCH' },
    { url: 'http://neo.local/etendo/sws/neo/contacts/locationAddress/line-1?parentId=bp-1', method: 'DELETE' },
  ]);
  assert.deepEqual(JSON.parse(calls[1].body!), { phone: '555', parentId: 'bp-1' });
  assert.deepEqual(JSON.parse(calls[2].body!), { phone: '556' });
  assert.deepEqual(JSON.parse(calls[3].body!), { phone: '557' });
});
