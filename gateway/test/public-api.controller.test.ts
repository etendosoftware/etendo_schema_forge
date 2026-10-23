// @covers gateway/src/public-api/public-api.controller.ts
// @covers gateway/src/public-api/json-api-request.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
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

test('propagates a NeoServlet 401 as a 401 error document, not a raw parse crash', async () => {
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
    (error: unknown) => error instanceof HttpException && error.getStatus() === 401
  );
});

test('propagates a NeoServlet 5xx as a 502, not a raw parse crash', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });
  const controller = new PublicApiController(schema, 'http://neo.local/etendo', fakeFetch as typeof fetch);
  await assert.rejects(
    () => controller.list('businessPartner', { neoJwt: 'jwt-abc' } as any),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 502
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
    JSON.stringify({ response: { data: [{ name: 'Widget', category: { id: 'cat-1', name: 'Retail' } }] } }),
    { status: 200 },
  );
  const controller = new PublicApiController(schema, 'http://neo.local/etendo', fakeFetch as typeof fetch);
  const result = await controller.list('businessPartner', { neoJwt: 'jwt-abc' } as any);
  assert.deepEqual(result, {
    data: [{
      type: 'businessPartner',
      attributes: { name: 'Widget' },
      relationships: {
        category: {
          data: { type: 'product-category', id: 'cat-1' },
          links: { related: '/api/v1/product-category/cat-1' },
        },
      },
    }],
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

// ---- ETP-5369: JSON:API request/response contract -------------------------

const crudSchema: PublicApiSchema = {
  apiVersion: 'v1',
  entities: {
    product: {
      publicApi: true,
      specName: 'product',
      operations: ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'],
      fields: {
        name: { publicApi: true, direction: 'inout', internalPath: 'name', type: 'passthrough', handlerId: null },
        created: { publicApi: true, direction: 'out', internalPath: 'created', type: 'passthrough', handlerId: null },
        category: {
          publicApi: true, direction: 'inout', internalPath: 'productCategory', type: 'passthrough', handlerId: null,
          relationship: { resource: 'product-category', cardinality: 'one', foreignKey: 'category' },
        } as any,
      },
    },
  },
};
const request = { neoJwt: 'jwt-abc' } as any;

function controllerAnswering(status: number, body: unknown, calls: Array<{ url: string; init?: RequestInit }> = []) {
  const fakeFetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === null ? null : JSON.stringify(body), { status });
  };
  return new PublicApiController(crudSchema, 'http://neo.local/etendo', fakeFetch as typeof fetch);
}

async function statusAndErrors(action: Promise<unknown>) {
  try {
    await action;
  } catch (error) {
    assert.ok(error instanceof HttpException, `expected an HttpException, got ${String(error)}`);
    const response = error.getResponse() as { errors?: Array<Record<string, any>> };
    return { status: error.getStatus(), errors: response.errors };
  }
  assert.fail('expected the call to be refused');
}

test('accepts a JSON:API body with relationships and no attributes', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const controller = controllerAnswering(200, { response: { data: [{ id: 'p-1' }] } }, calls);
  await controller.create('product', {
    data: { type: 'product', relationships: { category: { data: { type: 'product-category', id: 'cat-1' } } } },
  } as any, request);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { productCategory: 'cat-1' });
});

test('accepts a JSON:API body with attributes and relationships and clears a relationship with data null', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const controller = controllerAnswering(200, { response: { data: [{ id: 'p-1' }] } }, calls);
  await controller.patch('product', 'p-1', {
    data: { type: 'product', id: 'p-1', attributes: { name: 'Widget' }, relationships: { category: { data: null } } },
  } as any, request);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { name: 'Widget', productCategory: null });
});

test('still accepts a flat body', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const controller = controllerAnswering(200, { response: { data: [{ id: 'p-1' }] } }, calls);
  await controller.update('product', 'p-1', { name: 'Widget' }, request);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { name: 'Widget' });
});

test('refuses a relationship written as an attribute, a read-only attribute and a type outside the resource', async () => {
  const controller = controllerAnswering(200, { response: { data: [] } });
  const cases: Array<[Record<string, unknown>, number, RegExp]> = [
    [{ data: { type: 'product', attributes: { category: 'cat-1' } } }, 400, /category.{1,4} is a relationship/],
    [{ data: { type: 'product', attributes: { created: 'x' } } }, 400, /Field .{1,4}created.{1,4} is not writable/],
    [{ data: { type: 'other', attributes: { name: 'x' } } }, 409, /does not match .{1,4}product/],
    [{ data: [{ type: 'product' }] }, 400, /single resource object/],
    [{ data: { type: 'product', relationships: { category: { data: { type: 'wrong', id: 'c' } } } } }, 409, /expects type .{1,4}product-category/],
    [{ data: { type: 'product', relationships: { category: {} } } }, 400, /must carry a .{1,4}data.{1,4} member/],
    [{ data: { type: 'product', relationships: { category: { data: [{ type: 'product-category', id: 'c' }] } } } }, 400, /single resource identifier/],
    [{ data: { type: 'product', relationships: { name: { data: null } } } }, 400, /Relationship .{1,4}name.{1,4} is not writable/],
  ];
  for (const [body, status, message] of cases) {
    await assert.rejects(
      () => controller.create('product', body, request),
      (error: unknown) => error instanceof HttpException && error.getStatus() === status && message.test(JSON.stringify(error.getResponse())),
      JSON.stringify(body),
    );
  }
});

test('refuses a body id that differs from the URL id with 409', async () => {
  const controller = controllerAnswering(200, { response: { data: [] } });
  await assert.rejects(
    () => controller.patch('product', 'p-1', { data: { type: 'product', id: 'p-2', attributes: { name: 'x' } } } as any, request),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 409,
  );
});

test('carries Etendo structured error details (nested and flat shapes) into the public error document', async () => {
  const nested = await statusAndErrors(
    controllerAnswering(400, { error: { message: 'Name is required', status: 400 } }).create('product', { name: 'x' }, request),
  );
  assert.deepEqual(nested, { status: 400, errors: [{ status: '400', title: 'Bad Request', detail: 'Name is required' }] });

  const flat = await statusAndErrors(controllerAnswering(409, {
    status: 409, error: 'stale_record', message: 'Record changed', detail: 'Modified by someone else.', hint: 'Read it again.',
  }).update('product', 'p-1', { name: 'x' }, request));
  assert.deepEqual(flat, {
    status: 409,
    errors: [{
      status: '409', code: 'stale_record', title: 'Conflict', detail: 'Record changed',
      meta: { detail: 'Modified by someone else.', hint: 'Read it again.' },
    }],
  });
});

test('passes Etendo statuses 400, 401, 402, 403, 404, 409 and 422 through', async () => {
  for (const status of [400, 401, 402, 403, 404, 409, 422]) {
    const result = await statusAndErrors(
      controllerAnswering(status, { error: { message: `m${status}`, status } }).get('product', 'p-1', request),
    );
    assert.equal(result.status, status);
    assert.equal(result.errors?.[0].status, String(status));
    assert.equal(result.errors?.[0].detail, `m${status}`);
  }
});

test('answers 502 without Etendo internals for a 5xx or an unexpected status', async () => {
  for (const status of [500, 501, 405]) {
    const result = await statusAndErrors(controllerAnswering(status, {
      error: { message: 'java.lang.NullPointerException at org.openbravo.Foo.bar(Foo.java:10)' },
    }).list('product', request));
    assert.equal(result.status, 502);
    assert.doesNotMatch(JSON.stringify(result.errors), /NullPointer|openbravo|Foo\.java/);
    assert.equal(result.errors?.[0].meta?.upstreamStatus, status);
  }
});

test('falls back to a generic detail when Etendo answers an error without a JSON body', async () => {
  const result = await statusAndErrors(controllerAnswering(404, null).get('product', 'p-1', request));
  assert.deepEqual(result, {
    status: 404,
    errors: [{ status: '404', title: 'Not Found', detail: 'Etendo refused the request with status 404.' }],
  });
});

test('DELETE returns no body whatever Etendo answered on success', async () => {
  assert.equal(await controllerAnswering(204, null).remove('product', 'p-1', request), undefined);
  assert.equal(await controllerAnswering(200, { response: { data: [{ id: 'p-1' }] } }).remove('product', 'p-1', request), undefined);
  assert.equal(Reflect.getMetadata('__httpCode__', PublicApiController.prototype.remove), 204);
  assert.equal(Reflect.getMetadata('__httpCode__', PublicApiController.prototype.removeChild), 204);
});

test('an upstream 204 on PUT/PATCH becomes a meta-only document, never null', async () => {
  for (const verb of ['update', 'patch'] as const) {
    const result = await controllerAnswering(204, null)[verb]('product', 'p-1', { name: 'x' }, request);
    assert.deepEqual(result, { meta: { status: 'updated' } });
  }
});

test('an upstream 204 on GET or POST is a 502', async () => {
  assert.equal((await statusAndErrors(controllerAnswering(204, null).get('product', 'p-1', request))).status, 502);
  assert.equal((await statusAndErrors(controllerAnswering(204, null).create('product', { name: 'x' }, request))).status, 502);
});

test('a single-record read returns data as one resource object, a collection returns an array', async () => {
  const record = { id: 'p-1', name: 'Widget', productCategory: undefined };
  const single = await controllerAnswering(200, { response: { data: [record] } }).get('product', 'p-1', request);
  assert.ok(!Array.isArray((single as any).data));
  assert.equal((single as any).data.type, 'product');
  assert.equal((single as any).data.id, 'p-1');
  assert.equal((single as any).data.links.self, '/api/v1/product/p-1');

  const created = await controllerAnswering(201, { response: { data: [record] } }).create('product', { name: 'Widget' }, request);
  assert.ok(!Array.isArray((created as any).data));

  const list = await controllerAnswering(200, { response: { data: [record, { ...record, id: 'p-2' }] } }).list('product', request);
  assert.equal((list as any).data.length, 2);
  const one = await controllerAnswering(200, { response: { data: [record] } }).list('product', request);
  assert.equal(Array.isArray((one as any).data), true, 'a one-record collection stays an array');
  const none = await controllerAnswering(200, { response: { data: [] } }).list('product', request);
  assert.deepEqual(none, { data: [] });
});

test('a single-record read of a missing record is 404 and an ambiguous answer is 502', async () => {
  assert.equal((await statusAndErrors(controllerAnswering(200, { response: { data: [] } }).get('product', 'nope', request))).status, 404);
  assert.equal((await statusAndErrors(controllerAnswering(200, { response: { data: null } }).get('product', 'nope', request))).status, 404);
  assert.equal(
    (await statusAndErrors(controllerAnswering(200, { response: { data: [{ id: 'a' }, { id: 'b' }] } }).get('product', 'a', request))).status,
    502,
  );
});

test('an empty answer to a write is a 502, never a 404 that would deny a possibly successful write', async () => {
  const empty = { response: { data: [] } };
  assert.equal((await statusAndErrors(controllerAnswering(200, empty).create('product', { name: 'x' }, request))).status, 502);
  assert.equal((await statusAndErrors(controllerAnswering(200, empty).patch('product', 'p-1', { name: 'x' }, request))).status, 502);
  assert.equal((await statusAndErrors(controllerAnswering(200, empty).update('product', 'p-1', { name: 'x' }, request))).status, 502);
});
