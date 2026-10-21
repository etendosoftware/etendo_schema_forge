// @covers gateway/src/public-api/public-api.controller.ts
// @covers gateway/src/public-api/json-api-request.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException, BadGatewayException, BadRequestException, HttpException, PreconditionFailedException } from '@nestjs/common';
import { PublicApiController, toEtag, versionFromIfMatch } from '../src/public-api/public-api.controller.ts';
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
    assert.equal(url, 'http://neo.local/etendo/sws/neo/contacts/businessPartner?_startRow=0&_endRow=49');
    return new Response(
      JSON.stringify({ response: { data: [{ name: 'Widget', internalCostBasis: 99 }] } }),
      { status: 200 }
    );
  };
  const controller = new PublicApiController(schema, 'http://neo.local/etendo', fakeFetch as typeof fetch);
  const result = await controller.list('businessPartner', { neoJwt: 'jwt-abc' } as any);
  assert.deepEqual((result as any).data, [{ type: 'businessPartner', attributes: { name: 'Widget' } }]);
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
  assert.deepEqual({ data: (result as any).data }, {
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
    { url: 'http://neo.local/etendo/sws/neo/contacts/locationAddress?parentId=bp-1&_startRow=0&_endRow=49', method: 'GET' },
    { url: 'http://neo.local/etendo/sws/neo/contacts/locationAddress?parentId=bp-1', method: 'POST' },
    { url: 'http://neo.local/etendo/sws/neo/contacts/locationAddress/line-1?parentId=bp-1', method: 'PUT' },
    { url: 'http://neo.local/etendo/sws/neo/contacts/locationAddress/line-1?parentId=bp-1', method: 'PATCH' },
    { url: 'http://neo.local/etendo/sws/neo/contacts/locationAddress/line-1?parentId=bp-1', method: 'DELETE' },
  ]);
  assert.deepEqual(JSON.parse(calls[1].body!), { phone: '555', parentId: 'bp-1' });
  assert.deepEqual(JSON.parse(calls[2].body!), { phone: '556' });
  assert.deepEqual(JSON.parse(calls[3].body!), { phone: '557' });
});

// ── Optimistic concurrency: ETag / If-Match ──────────────────────────────────

const VERSION = '2026-10-15T13:44:37-03:00';
const NEXT_VERSION = '2026-10-15T13:44:39-03:00';

function versionedSchema() {
  const versioned = structuredClone(schema) as any;
  versioned.entities.businessPartner.operations = ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'];
  versioned.entities.businessPartner.fields.name.direction = 'inout';
  versioned.entities.businessPartner.fields.updated = {
    publicApi: true, direction: 'out', internalPath: 'updated', type: 'passthrough', handlerId: null,
  };
  versioned.entities['contact-lines'] = {
    publicApi: true,
    publicName: 'contact-lines',
    specName: 'contacts',
    entityName: 'locationAddress',
    operations: ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'],
    parent: { resource: 'businessPartner', entityName: 'businessPartner', pathSegment: 'locations', foreignKey: 'businessPartner' },
    fields: {
      phone: { publicApi: true, direction: 'inout', internalPath: 'phone', type: 'passthrough', handlerId: null },
      updated: { publicApi: true, direction: 'out', internalPath: 'updated', type: 'passthrough', handlerId: null },
    },
  };
  return versioned;
}

function headerSink() {
  const headers: Record<string, string> = {};
  return { headers, setHeader: (name: string, value: string) => { headers[name] = value; } };
}

function statusOf(error: unknown) {
  return error instanceof HttpException ? error.getStatus() : undefined;
}

test('If-Match round-trips the ETag a read returned, for every NEO timestamp form', () => {
  for (const version of [VERSION, '2026-10-15T16:44:37Z', '2026-10-15T13:44:37-0300', '2026-10-15T13:44:37.123-03:00']) {
    assert.equal(versionFromIfMatch(toEtag(version)), version, version);
  }
});

test('only a canonical NEO timestamp becomes an ETag', () => {
  for (const value of [null, undefined, '', 'not-a-date', '2026-10-15 13:44:37.123', 1739000000]) {
    assert.equal(toEtag(value), undefined, String(value));
  }
});

test('a missing or wildcard If-Match is a 428 and a foreign one a 412', () => {
  for (const value of [undefined, '', '  ', '*']) {
    assert.throws(
      () => versionFromIfMatch(value),
      (error) => statusOf(error) === 428 && ((error as HttpException).getResponse() as { code?: string }).code === 'precondition_required',
      String(value),
    );
  }
  assert.throws(() => versionFromIfMatch('*'), /If-Match: \* is not accepted/);
  const weak = `W/${toEtag(VERSION)}`;
  const unquoted = toEtag(VERSION)!.slice(1, -1);
  const notAVersion = `"${Buffer.from('not-a-date', 'utf8').toString('base64url')}"`;
  const list = `${toEtag(VERSION)}, ${toEtag(NEXT_VERSION)}`;
  for (const value of [weak, unquoted, notAVersion, list, '"%%%"']) {
    assert.throws(
      () => versionFromIfMatch(value),
      (error) => error instanceof PreconditionFailedException && (error.getResponse() as { code?: string }).code === 'precondition_failed',
      String(value),
    );
  }
});

test('reading a record returns its ETag in the header and as meta.etag', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ response: { data: [{ id: 'bp-1', name: 'Acme', updated: VERSION }] } }), { status: 200 });
  const controller = new PublicApiController(versionedSchema(), 'http://neo.local/etendo', fakeFetch as typeof fetch);
  const res = headerSink();
  const result = await controller.get('businessPartner', 'bp-1', { neoJwt: 'jwt' } as any, res) as any;
  // NeoServlet wraps a single record in a one-element array; whether the
  // gateway unwraps it is a separate contract decision, not this test's.
  const resource = Array.isArray(result.data) ? result.data[0] : result.data;
  assert.equal(res.headers.ETag, toEtag(VERSION));
  assert.equal(resource.meta.etag, toEtag(VERSION));
  assert.equal(resource.attributes.updated, VERSION);
});

test('a list carries meta.etag per item and no ETag header', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ response: { data: [
    { id: 'bp-1', name: 'A', updated: VERSION },
    { id: 'bp-2', name: 'B', updated: NEXT_VERSION },
  ] } }), { status: 200 });
  const controller = new PublicApiController(versionedSchema(), 'http://neo.local/etendo', fakeFetch as typeof fetch);
  const result = await controller.list('businessPartner', { neoJwt: 'jwt' } as any) as any;
  assert.deepEqual(result.data.map((item: any) => item.meta.etag), [toEtag(VERSION), toEtag(NEXT_VERSION)]);
});

test('an update without If-Match is refused with 428 before reaching Etendo', async () => {
  let called = false;
  const fakeFetch = async () => { called = true; return new Response('{}', { status: 200 }); };
  const controller = new PublicApiController(versionedSchema(), 'http://neo.local/etendo', fakeFetch as typeof fetch);
  for (const call of [
    () => controller.patch('businessPartner', 'bp-1', { name: 'X' }, { neoJwt: 'jwt' } as any),
    () => controller.update('businessPartner', 'bp-1', { name: 'X' }, { neoJwt: 'jwt' } as any),
    () => controller.patchChild('businessPartner', 'bp-1', 'locations', 'line-1', { phone: '1' }, { neoJwt: 'jwt' } as any),
    () => controller.updateChild('businessPartner', 'bp-1', 'locations', 'line-1', { phone: '1' }, { neoJwt: 'jwt' } as any),
  ]) {
    await assert.rejects(call, (error) => statusOf(error) === 428);
  }
  assert.equal(called, false);
});

test('a valid If-Match is sent to Etendo as updated and the new ETag is returned', async () => {
  let sent: Record<string, unknown> = {};
  const fakeFetch = async (_url: string, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ response: { data: [{ id: 'bp-1', name: 'X', updated: NEXT_VERSION }] } }), { status: 200 });
  };
  const controller = new PublicApiController(versionedSchema(), 'http://neo.local/etendo', fakeFetch as typeof fetch);
  const res = headerSink();
  await controller.patch('businessPartner', 'bp-1', { name: 'X' }, { neoJwt: 'jwt' } as any, toEtag(VERSION), res);
  assert.deepEqual(sent, { name: 'X', updated: VERSION });
  assert.equal(res.headers.ETag, toEtag(NEXT_VERSION));
});

test('a stale If-Match (Etendo stale_record) is a 412, not a 400', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({
    status: 409, error: 'stale_record', message: 'This record was modified by someone else after you read it.',
  }), { status: 409 });
  const controller = new PublicApiController(versionedSchema(), 'http://neo.local/etendo', fakeFetch as typeof fetch);
  await assert.rejects(
    () => controller.patch('businessPartner', 'bp-1', { name: 'X' }, { neoJwt: 'jwt' } as any, toEtag(VERSION)),
    (error) => error instanceof HttpException && error.getStatus() === 412 && /modified by someone else/.test(JSON.stringify(error.getResponse()))
      && JSON.stringify(error.getResponse()).includes('stale_record'),
  );
});

test('updated stays read-only in the body; the version travels in If-Match', async () => {
  let called = false;
  const fakeFetch = async () => { called = true; throw new Error('must not reach Etendo'); };
  const controller = new PublicApiController(versionedSchema(), 'http://neo.local/etendo', fakeFetch as typeof fetch);
  await assert.rejects(
    () => controller.patch('businessPartner', 'bp-1', { updated: VERSION }, { neoJwt: 'jwt' } as any, toEtag(VERSION)),
    /Field "updated" is not writable/,
  );
  assert.equal(called, false);
});

test('a 409 that is not stale_record stays a 409', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ error: { message: 'Duplicate key' } }), { status: 409 });
  const controller = new PublicApiController(versionedSchema(), 'http://neo.local/etendo', fakeFetch as typeof fetch);
  await assert.rejects(
    () => controller.patch('businessPartner', 'bp-1', { name: 'X' }, { neoJwt: 'jwt' } as any, toEtag(VERSION)),
    (error) => error instanceof HttpException && error.getStatus() === 409 && /Duplicate key/.test(JSON.stringify(error.getResponse())),
  );
});

test('child PUT and PATCH with a valid If-Match send updated and return the new ETag', async () => {
  const sent: Array<Record<string, unknown>> = [];
  const fakeFetch = async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ response: { data: [{ id: 'line-1', phone: '1', updated: NEXT_VERSION }] } }), { status: 200 });
  };
  const controller = new PublicApiController(versionedSchema(), 'http://neo.local/etendo', fakeFetch as typeof fetch);
  for (const call of ['updateChild', 'patchChild'] as const) {
    const res = headerSink();
    await controller[call]('businessPartner', 'bp-1', 'locations', 'line-1', { phone: '1' }, { neoJwt: 'jwt' } as any, toEtag(VERSION), res);
    assert.equal(res.headers.ETag, toEtag(NEXT_VERSION), call);
  }
  assert.deepEqual(sent, [{ phone: '1', updated: VERSION }, { phone: '1', updated: VERSION }]);
});

test('create and a child read return the ETag header', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ response: { data: [{ id: 'x-1', name: 'A', phone: '1', updated: VERSION }] } }), { status: 200 });
  const controller = new PublicApiController(versionedSchema(), 'http://neo.local/etendo', fakeFetch as typeof fetch);
  const created = headerSink();
  await controller.create('businessPartner', { name: 'A' }, { neoJwt: 'jwt' } as any, created);
  const read = headerSink();
  await controller.getChild('businessPartner', 'bp-1', 'locations', 'x-1', { neoJwt: 'jwt' } as any, read);
  assert.equal(created.headers.ETag, toEtag(VERSION));
  assert.equal(read.headers.ETag, toEtag(VERSION));
});

test('a record whose updated is not a canonical timestamp gets no ETag at all', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ response: { data: [{ id: 'bp-1', name: 'A', updated: '2026-10-15 13:44:37.123' }] } }), { status: 200 });
  const controller = new PublicApiController(versionedSchema(), 'http://neo.local/etendo', fakeFetch as typeof fetch);
  const res = headerSink();
  const result = await controller.get('businessPartner', 'bp-1', { neoJwt: 'jwt' } as any, res) as any;
  const resource = Array.isArray(result.data) ? result.data[0] : result.data;
  assert.equal(res.headers.ETag, undefined);
  assert.equal(resource.meta, undefined);
});

test('a read-only child refuses writes with 404 before reaching Etendo', async () => {
  const readOnly = versionedSchema();
  readOnly.entities['contact-lines'].operations = ['GET', 'LIST'];
  let called = false;
  const fakeFetch = async () => { called = true; throw new Error('must not reach Etendo'); };
  const controller = new PublicApiController(readOnly, 'http://neo.local/etendo', fakeFetch as typeof fetch);
  await assert.rejects(
    () => controller.createChild('businessPartner', 'bp-1', 'locations', { phone: '1' }, { neoJwt: 'jwt' } as any),
    /Operation POST is not exposed/,
  );
  await assert.rejects(
    () => controller.removeChild('businessPartner', 'bp-1', 'locations', 'line-1', { neoJwt: 'jwt' } as any),
    /Operation DELETE is not exposed/,
  );
  assert.equal(called, false);
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
  assert.deepEqual((none as any).data, []);
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

// ---- business actions (ETP-5783) ----

const actionSchema = (): PublicApiSchema => {
  const s = structuredClone(schema) as any;
  s.entities.salesDoc = {
    publicApi: true, specName: 'sales-doc', entityName: 'header', operations: ['GET', 'LIST'],
    fields: { id: { publicApi: true, direction: 'out', internalPath: 'id', type: 'passthrough', handlerId: null },
      documentStatus: { publicApi: true, direction: 'out', internalPath: 'documentStatus', type: 'passthrough', handlerId: null } },
    processes: [{ action: 'complete', method: 'POST', path: '/header/:id/action/documentAction', body: { docAction: 'CO' } }],
  };
  s.entities.salesDocLine = {
    publicApi: true, specName: 'sales-doc', entityName: 'line', operations: ['GET', 'LIST'], fields: {},
    parent: { resource: 'salesDoc', entityName: 'header', foreignKey: 'order', pathSegment: 'lines' },
    processes: [{ action: 'complete', method: 'POST', path: '/line/:id/action/documentAction', body: { docAction: 'CO' } }],
  };
  return s;
};

function actionFetch(actionAnswer: () => Response, readAnswer: () => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return url.includes('/action/') ? actionAnswer() : readAnswer();
  };
  return { calls, fn: fn as typeof fetch };
}

const okRead = () => new Response(JSON.stringify({ response: { data: [{ id: 'd1', documentStatus: 'CO' }] } }), { status: 200 });

test('runAction forwards the manifest path and body, then re-reads the record with meta.message', async () => {
  const { calls, fn } = actionFetch(() => new Response(JSON.stringify({ status: 'success', message: 'Done' }), { status: 200 }), okRead);
  const controller = new PublicApiController(actionSchema(), 'http://neo.local/etendo', fn);
  const result = await controller.runAction('salesDoc', 'd/1', 'complete', { neoJwt: 'jwt' } as any);
  assert.equal(calls[0].url, 'http://neo.local/etendo/sws/neo/sales-doc/header/d%2F1/action/documentAction');
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { docAction: 'CO' });
  assert.equal(calls[1].url, 'http://neo.local/etendo/sws/neo/sales-doc/header/d%2F1');
  assert.equal(calls[1].init?.method, 'GET');
  assert.equal((result as any).data.attributes.documentStatus, 'CO');
  assert.deepEqual((result as any).meta, { message: 'Done' });
});

test('runAction reports alreadyApplied from Etendo in meta', async () => {
  const { fn } = actionFetch(() => new Response(JSON.stringify({ status: 'success', message: 'Already', alreadyApplied: true }), { status: 200 }), okRead);
  const controller = new PublicApiController(actionSchema(), 'http://neo.local/etendo', fn);
  const result = await controller.runAction('salesDoc', 'd1', 'complete', { neoJwt: 'jwt' } as any);
  assert.deepEqual((result as any).meta, { message: 'Already', alreadyApplied: true });
});

test('runAction answers 200 with a hint when the record cannot be re-read after the action', async () => {
  const { fn } = actionFetch(() => new Response(JSON.stringify({ status: 'success', message: 'Done' }), { status: 200 }), () => new Response('{}', { status: 500 }));
  const controller = new PublicApiController(actionSchema(), 'http://neo.local/etendo', fn);
  const result = (await controller.runAction('salesDoc', 'd1', 'complete', { neoJwt: 'jwt' } as any)) as any;
  assert.equal(result.data, undefined);
  assert.equal(result.meta.message, 'Done');
  assert.match(result.meta.hint, /action succeeded/);
});

test('runAction rejects an unknown action and a child resource with 404', async () => {
  const { calls, fn } = actionFetch(() => new Response('{}', { status: 200 }), okRead);
  const controller = new PublicApiController(actionSchema(), 'http://neo.local/etendo', fn);
  for (const [entity, action] of [['salesDoc', 'void'], ['salesDocLine', 'complete'], ['nope', 'complete']]) {
    await assert.rejects(
      () => controller.runAction(entity, 'd1', action, { neoJwt: 'jwt' } as any),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 404,
    );
  }
  assert.equal(calls.length, 0);
});

test('runAction passes an Etendo refusal through and does not re-read', async () => {
  const { calls, fn } = actionFetch(() => new Response(JSON.stringify({ status: 'error', error: 'business_rule', message: 'Cannot complete' }), { status: 422 }), okRead);
  const controller = new PublicApiController(actionSchema(), 'http://neo.local/etendo', fn);
  await assert.rejects(
    () => controller.runAction('salesDoc', 'd1', 'complete', { neoJwt: 'jwt' } as any),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 422,
  );
  assert.equal(calls.length, 1);
});

test('runAction answers 502 with a hint when the connection to Etendo fails', async () => {
  const fn = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  const controller = new PublicApiController(actionSchema(), 'http://neo.local/etendo', fn);
  await assert.rejects(
    () => controller.runAction('salesDoc', 'd1', 'complete', { neoJwt: 'jwt' } as any),
    (error: any) => {
      const e = error.getResponse().errors[0];
      return error instanceof HttpException && error.getStatus() === 502
        && /may have been applied/.test(e.meta.hint) && !/Retry later/.test(e.detail);
    },
  );
});

test('runAction passes the exact NEO 422 business_rule body through with its message', async () => {
  const body = { status: 'error', message: 'Cannot complete an empty order', messageKeys: ['k1'],
    error: { status: 422, code: 'business_rule', message: 'Cannot complete an empty order', messageKeys: ['k1'] } };
  const { fn } = actionFetch(() => new Response(JSON.stringify(body), { status: 422 }), okRead);
  const controller = new PublicApiController(actionSchema(), 'http://neo.local/etendo', fn);
  await assert.rejects(
    () => controller.runAction('salesDoc', 'd1', 'complete', { neoJwt: 'jwt' } as any),
    (error: any) => error.getStatus() === 422 && error.getResponse().errors[0].detail.includes('Cannot complete an empty order'),
  );
});

test('runAction passes a 403 insufficient scope through as 403', async () => {
  const { fn } = actionFetch(() => new Response(JSON.stringify({ error: { status: 403, message: 'Insufficient scope: this request requires etendo:process' } }), { status: 403 }), okRead);
  const controller = new PublicApiController(actionSchema(), 'http://neo.local/etendo', fn);
  await assert.rejects(
    () => controller.runAction('salesDoc', 'd1', 'complete', { neoJwt: 'jwt' } as any),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 403,
  );
});

test('runAction merges action meta into the re-read document meta', async () => {
  const { fn } = actionFetch(() => new Response(JSON.stringify({ message: 'Done' }), { status: 200 }), okRead);
  const controller = new PublicApiController(actionSchema(), 'http://neo.local/etendo', fn);
  const result = (await controller.runAction('salesDoc', 'd1', 'complete', { neoJwt: 'jwt' } as any)) as any;
  assert.equal(result.meta.message, 'Done');
});

test('refuses the ids "." and ".." with 404 on actions and plain reads, without calling Etendo', async () => {
  const { calls, fn } = actionFetch(() => new Response('{}', { status: 200 }), okRead);
  const controller = new PublicApiController(actionSchema(), 'http://neo.local/etendo', fn);
  for (const id of ['.', '..', ' ']) {
    await assert.rejects(() => controller.runAction('salesDoc', id, 'complete', { neoJwt: 'jwt' } as any),
      (e: unknown) => e instanceof HttpException && e.getStatus() === 404);
    await assert.rejects(() => controller.get('salesDoc', id, { neoJwt: 'jwt' } as any),
      (e: unknown) => e instanceof HttpException && e.getStatus() === 404);
  }
  assert.equal(calls.length, 0);
});

// ---- List query: filters, sort, pagination (ETP-5780) -----------------------

const listSchema = {
  apiVersion: 'v1',
  entities: {
    contacts: {
      publicApi: true,
      publicName: 'contacts',
      specName: 'contacts',
      entityName: 'businessPartner',
      operations: ['GET', 'LIST'],
      fields: {
        id: { publicApi: true, direction: 'out', internalPath: 'id', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
        name: { publicApi: true, direction: 'inout', internalPath: 'name', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
        tax_id: { publicApi: true, direction: 'inout', internalPath: 'taxID', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
        secret: { publicApi: true, direction: 'in', internalPath: 'secretCode', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
      },
    },
    'contacts-contact': {
      publicApi: true,
      publicName: 'contacts-contact',
      specName: 'contacts',
      entityName: 'contact',
      operations: ['GET', 'LIST'],
      parent: { resource: 'contacts', entityName: 'businessPartner', pathSegment: 'contacts', foreignKey: 'businessPartner' },
      fields: {
        id: { publicApi: true, direction: 'out', internalPath: 'id', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
        phone: { publicApi: true, direction: 'inout', internalPath: 'phone', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
      },
    },
  },
} as unknown as PublicApiSchema;

function listing(envelope: unknown) {
  const urls: string[] = [];
  const fakeFetch = async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify({ response: envelope }), { status: 200 });
  };
  return { urls, controller: new PublicApiController(listSchema, 'http://neo.local/etendo', fakeFetch as typeof fetch) };
}

const rows = (count: number, from = 1) => Array.from({ length: count }, (_, i) => ({ id: `c-${from + i}`, name: `N${from + i}`, taxID: `T${from + i}`, secretCode: 's' }));
const neoParams = (url: string) => new URL(url).searchParams;

test('list forwards the validated window, sort and one criteria param to NEO', async () => {
  const { urls, controller } = listing({ status: 0, startRow: 20, endRow: 29, totalRows: 95, data: rows(10, 21) });
  const result = await controller.list('contacts', request, {
    page: { number: '3', size: '10' }, sort: '-name', filter: { name: { contains: 'ac' }, tax_id: { in: 'A,B' } },
  }) as any;
  const params = neoParams(urls[0]);
  assert.equal(params.get('_startRow'), '20');
  assert.equal(params.get('_endRow'), '29');
  assert.equal(params.get('_sortBy'), '-name,id');
  assert.equal(params.getAll('criteria').length, 1);
  assert.deepEqual(JSON.parse(params.get('criteria')!), [
    { fieldName: 'name', operator: 'iContains', value: 'ac' },
    { fieldName: 'taxID', operator: 'inSet', value: 'A,B' },
  ]);
  assert.equal(result.data.length, 10);
  assert.deepEqual(result.meta, { page: { number: 3, size: 10, total: 95 } });
  const keep = 'filter[name][contains]=ac&filter[tax_id][in]=A,B&sort=-name';
  assert.deepEqual(result.links, {
    self: `/api/v1/contacts?${keep}&page[number]=3&page[size]=10`,
    first: `/api/v1/contacts?${keep}&page[number]=1&page[size]=10`,
    prev: `/api/v1/contacts?${keep}&page[number]=2&page[size]=10`,
    next: `/api/v1/contacts?${keep}&page[number]=4&page[size]=10`,
    last: `/api/v1/contacts?${keep}&page[number]=10&page[size]=10`,
  });
});

test('list defaults to page 1 of 50 and never sends the client text anywhere but the criteria value', async () => {
  const { urls, controller } = listing({ startRow: 0, endRow: 1, totalRows: 2, data: rows(2) });
  const result = await controller.list('contacts', request, {}) as any;
  assert.equal(urls[0], 'http://neo.local/etendo/sws/neo/contacts/businessPartner?_startRow=0&_endRow=49');
  assert.deepEqual(result.meta, { page: { number: 1, size: 50, total: 2 } });
  assert.equal(result.links.next, null);
  assert.equal(result.links.prev, null);
  assert.equal(result.links.last, '/api/v1/contacts?page[number]=1&page[size]=50');
});

test('list: a refused query never reaches NEO, and the write-only field cannot be filtered or sorted', async () => {
  const { urls, controller } = listing({ data: [] });
  for (const query of [{ filter: { secret: 'x' } }, { sort: 'secret' }, { foo: 'bar' }, { page: { size: '500' } }, { filter: { taxID: 'x' } }]) {
    const refused = await statusAndErrors(controller.list('contacts', request, query as any));
    assert.equal(refused.status, 400);
    assert.ok(refused.errors?.[0].source.parameter);
  }
  assert.deepEqual(urls, []);
});

test('list: the last page is short, has no next, and a count of 0 is an empty first page', async () => {
  const last = await listing({ startRow: 20, endRow: 24, totalRows: 25, data: rows(5, 21) }).controller.list('contacts', request, { page: { number: '3', size: '10' } }) as any;
  assert.equal(last.links.next, null);
  assert.equal(last.links.last, last.links.self);
  const empty = await listing({ startRow: 0, endRow: 0, totalRows: 0, data: [] }).controller.list('contacts', request, { filter: { name: 'zzz' } }) as any;
  assert.deepEqual(empty.data, []);
  assert.deepEqual(empty.meta.page, { number: 1, size: 50, total: 0 });
});

test('list: a page past the end is empty, even though NEO rewinds and answers its first page', async () => {
  // Etendo's datasource answers page 1 (startRow 0) when the requested start is beyond the data.
  const { controller } = listing({ startRow: 0, endRow: 9, totalRows: 25, data: rows(10) });
  const result = await controller.list('contacts', request, { page: { number: '9', size: '10' } }) as any;
  assert.deepEqual(result.data, []);
  assert.deepEqual(result.meta.page, { number: 9, size: 10, total: 25 });
  assert.equal(result.links.next, null);
  assert.equal(result.links.prev, '/api/v1/contacts?page[number]=3&page[size]=10');
  assert.equal(result.links.last, '/api/v1/contacts?page[number]=3&page[size]=10');
});

test('list: without a trustworthy totalRows, total and last are omitted and next follows a full page', async () => {
  for (const totalRows of [undefined, null, 'many', -1, 1.5, 3]) {
    const full = await listing({ startRow: 0, endRow: 9, ...(totalRows === undefined ? {} : { totalRows }), data: rows(10) }).controller.list('contacts', request, { page: { size: '10' } }) as any;
    assert.deepEqual(full.meta.page, { number: 1, size: 10 }, `totalRows ${String(totalRows)}`);
    assert.equal('last' in full.links, false);
    assert.equal(full.links.next, '/api/v1/contacts?page[number]=2&page[size]=10');
  }
  const short = await listing({ startRow: 0, endRow: 3, data: rows(4) }).controller.list('contacts', request, { page: { size: '10' } }) as any;
  assert.equal(short.links.next, null);
});

test('list: a NEO answer longer than the page is cut to the page size', async () => {
  const result = await listing({ startRow: 0, endRow: 14, totalRows: 15, data: rows(15) }).controller.list('contacts', request, { page: { size: '10' } }) as any;
  assert.equal(result.data.length, 10);
});

test('child list validates its own query, keeps parentId and builds links on the master path', async () => {
  const { urls, controller } = listing({ startRow: 0, endRow: 1, totalRows: 2, data: [{ id: 'k-1', phone: '1' }, { id: 'k-2', phone: '2' }] });
  const result = await controller.listChild('contacts', 'bp 1', 'contacts', request, { filter: { phone: { contains: '5' } }, sort: 'phone', page: { size: '2' } }) as any;
  const params = neoParams(urls[0]);
  assert.equal(params.get('parentId'), 'bp 1');
  assert.equal(params.get('_endRow'), '1');
  assert.equal(params.get('_sortBy'), 'phone,id');
  assert.deepEqual(JSON.parse(params.get('criteria')!), [{ fieldName: 'phone', operator: 'iContains', value: '5' }]);
  assert.equal(result.data.length, 2);
  assert.equal(result.links.self, '/api/v1/contacts/bp%201/contacts?filter[phone][contains]=5&sort=phone&page[number]=1&page[size]=2');

  // The master's own fields are not the child's, and parentId cannot be overridden from the query.
  assert.equal((await statusAndErrors(controller.listChild('contacts', 'bp-1', 'contacts', request, { filter: { name: 'x' } }))).errors?.[0].source.parameter, 'filter[name]');
  assert.equal((await statusAndErrors(controller.listChild('contacts', 'bp-1', 'contacts', request, { parentId: 'other' } as any))).errors?.[0].source.parameter, 'parentId');
  assert.equal(urls.length, 1);
});

test('a single-record read is not a list and carries no pagination', async () => {
  const { controller } = listing({ data: [rows(1)[0]] });
  const single = await controller.get('contacts', 'c-1', request) as any;
  assert.equal(single.links, undefined);
  assert.equal(single.meta, undefined);
});
