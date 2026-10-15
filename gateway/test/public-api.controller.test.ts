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

test('If-Match round-trips the ETag a read returned', () => {
  assert.equal(versionFromIfMatch(toEtag(VERSION)), VERSION);
  assert.equal(toEtag(null), undefined);
  assert.equal(toEtag(''), undefined);
});

test('a missing or wildcard If-Match is a 428 and a foreign one a 412', () => {
  for (const value of [undefined, '', '  ', '*']) {
    assert.throws(() => versionFromIfMatch(value), (error) => statusOf(error) === 428, String(value));
  }
  const weak = `W/${toEtag(VERSION)}`;
  const unquoted = toEtag(VERSION)!.slice(1, -1);
  const notAVersion = toEtag('not-a-date');
  for (const value of [weak, unquoted, notAVersion, '"%%%"']) {
    assert.throws(() => versionFromIfMatch(value), PreconditionFailedException, String(value));
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
    (error) => error instanceof PreconditionFailedException && /modified by someone else/.test((error as Error).message),
  );
});

test('updated stays read-only in the body; the version travels in If-Match', async () => {
  const controller = new PublicApiController(versionedSchema(), 'http://neo.local/etendo', fetch);
  await assert.rejects(
    () => controller.patch('businessPartner', 'bp-1', { updated: VERSION }, { neoJwt: 'jwt' } as any, toEtag(VERSION)),
    BadRequestException,
  );
});
