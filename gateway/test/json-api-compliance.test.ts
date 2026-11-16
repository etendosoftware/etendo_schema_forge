// @covers gateway/src/openapi/build-per-entity-paths.ts
// @covers gateway/src/public-api/public-api.controller.ts
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicApiSchema } from '@etendosoftware/api-gateway-core';
import { buildPerEntityOpenApiPaths } from '../src/openapi/build-per-entity-paths.ts';
import { PublicApiController, toEtag } from '../src/public-api/public-api.controller.ts';

// JSON:API compliance checks over the REAL public API manifest, so a resource,
// relationship or verb added to the manifest later is checked without editing
// this file (ETP-5369).

const manifest = JSON.parse(
  await readFile(new URL('../../public-api/base.v1.json', import.meta.url), 'utf8'),
) as PublicApiSchema;
const entities = Object.entries(manifest.entities) as Array<[string, any]>;
const paths = buildPerEntityOpenApiPaths(manifest);
const operations = Object.entries(paths).flatMap(([path, item]) =>
  Object.entries(item).map(([method, operation]) => ({ path, method, operation })));
const MEDIA = 'application/vnd.api+json';

const relationshipFields = entities.flatMap(([name, entity]) =>
  Object.entries(entity.fields as Record<string, any>)
    .filter(([, field]) => field.relationship)
    .map(([field, definition]) => ({ entity: name, field, relationship: definition.relationship as { resource: string } })));

function resourceOf(path: string, method: string, status: string) {
  const data = (paths[path][method].responses[status].content![MEDIA].schema.properties as any).data;
  return data.items ?? data;
}

test('the manifest is not empty and exposes at least one operation per resource', () => {
  assert.ok(entities.length > 0);
  assert.ok(operations.length > 0);
});

test('no relationship is duplicated inside attributes in the OpenAPI schemas', () => {
  for (const { path, method, operation } of operations) {
    const schemas = [
      ...Object.values(operation.responses).flatMap((response) => Object.values(response.content ?? {})).map((media) => ({ schema: media.schema, request: false })),
      ...Object.values(operation.requestBody?.content ?? {}).map((media) => ({ schema: media.schema, request: true })),
    ];
    for (const { schema, request } of schemas) {
      const data = (schema.properties as any)?.data;
      const resource = data?.items ?? data;
      if (!resource?.properties?.attributes) continue;
      const entityName = resource.properties.type.enum[0];
      const entity = manifest.entities[entityName] as any;
      // A lookup lists values of a reference (type payment-method, ...), not a published resource.
      if (!entity) {
        assert.match(path, /\/lookups\//, `${method} ${path}: resource type ${entityName} is not in the manifest`);
        continue;
      }
      for (const [field, definition] of Object.entries(entity.fields as Record<string, any>)) {
        if (!definition.relationship) continue;
        assert.equal(resource.properties.attributes.properties[field], undefined, `${method} ${path}: ${entityName}.${field} is in attributes`);
        // A request body lists only writable relationships; a response only readable ones.
        const published = (request ? ['in', 'inout'] : ['out', 'inout']).includes(definition.direction);
        if (!published) continue;
        assert.ok(resource.properties.relationships?.properties[field], `${method} ${path}: ${entityName}.${field} is not a relationship`);
      }
    }
  }
});

test('every relationship carries type + id linkage to a resource that exists in the manifest', () => {
  for (const { entity, field, relationship } of relationshipFields) {
    assert.ok(manifest.entities[relationship.resource], `${entity}.${field} points to unknown resource ${relationship.resource}`);
    const readPath = (manifest.entities[entity] as any).parent
      ? `/api/v1/${(manifest.entities[entity] as any).parent.resource}/{parentId}/${(manifest.entities[entity] as any).parent.pathSegment}`
      : `/api/v1/${entity}`;
    if (!paths[readPath]?.get) continue;
    const linkage = resourceOf(readPath, 'get', '200').properties.relationships.properties[field].properties.data.properties;
    assert.deepEqual(linkage.type.enum, [relationship.resource]);
    assert.deepEqual(linkage.id, { type: 'string' });
  }
});

test('the master foreign key of a child resource is never an attribute', () => {
  for (const [name, entity] of entities) {
    if (!entity.parent) continue;
    const base = `/api/v1/${entity.parent.resource}/{parentId}/${entity.parent.pathSegment}`;
    const readable = paths[base]?.get;
    if (!readable) continue;
    const attributes = resourceOf(base, 'get', '200').properties.attributes.properties;
    assert.equal(attributes[entity.parent.foreignKey], undefined, `${name}: ${entity.parent.foreignKey} must come from the URL`);
  }
});

test('identifiers are resource-level members, never attributes', () => {
  for (const { path, method, operation } of operations) {
    if (!operation.responses['200']?.content || method !== 'get') continue;
    assert.equal(resourceOf(path, 'get', '200').properties.attributes.properties.id, undefined, path);
  }
});

test('single-resource responses document data as an object and collections as an array', () => {
  for (const { path, method, operation } of operations) {
    if (method !== 'get') continue;
    const data = (operation.responses['200'].content![MEDIA].schema.properties as any).data;
    assert.equal(data.type, path.endsWith('{id}') ? 'object' : 'array', path);
  }
});

test('every operation documents its error responses and DELETE documents only 204', () => {
  for (const { path, method, operation } of operations) {
    for (const status of ['401', '404', '502']) assert.ok(operation.responses[status], `${method} ${path} lacks ${status}`);
    if (method === 'get') continue;
    assert.ok(operation.responses['400'], `${method} ${path} lacks 400`);
    if (method !== 'delete') assert.ok(operation.responses['415'], `${method} ${path} lacks 415`);
    if (method === 'delete') {
      assert.deepEqual(Object.keys(operation.responses).filter((status) => status.startsWith('2')), ['204'], path);
    }
  }
});

test('runtime documents only carry JSON:API members and keep relationships out of attributes', async () => {
  const documents: unknown[] = [];
  for (const [name, entity] of entities) {
    if (entity.parent || !(entity.operations as string[]).some((operation) => ['GET', 'LIST'].includes(operation.toUpperCase()))) continue;
    const record: Record<string, unknown> = { id: `${name}-1` };
    for (const [field, definition] of Object.entries(entity.fields as Record<string, any>)) {
      if (field === 'id') continue;
      record[definition.internalPath] = definition.relationship ? { id: 'rel-1', name: 'x' } : 'v';
    }
    const fakeFetch = async () => new Response(JSON.stringify({ response: { data: [record] } }), { status: 200 });
    const controller = new PublicApiController(manifest, 'http://neo.local/etendo', fakeFetch as typeof fetch);
    const single = await controller.get(name, `${name}-1`, { neoJwt: 'jwt' } as any) as any;
    assert.ok(!Array.isArray(single.data), `${name}: single record must be an object`);
    for (const [field, definition] of Object.entries(entity.fields as Record<string, any>)) {
      if (!definition.relationship) continue;
      assert.equal(single.data.attributes[field], undefined, `${name}.${field} duplicated in attributes`);
      assert.deepEqual(single.data.relationships[field].data, { type: definition.relationship.resource, id: 'rel-1' });
    }
    documents.push(single);
  }
  for (const document of documents as Array<Record<string, unknown>>) {
    assert.deepEqual(Object.keys(document).filter((key) => !['data', 'errors', 'meta', 'links', 'jsonapi', 'included'].includes(key)), []);
  }
  assert.ok(documents.length > 0);
});

test('relationship fields of the manifest are writable only as relationships', async () => {
  for (const { entity, field, relationship } of relationshipFields) {
    const definition = (manifest.entities[entity] as any).fields[field];
    if (!['in', 'inout'].includes(definition.direction) || (manifest.entities[entity] as any).parent) continue;
    if (!(manifest.entities[entity] as any).operations.map((operation: string) => operation.toUpperCase()).includes('POST')) continue;
    const bodies: unknown[] = [];
    const fakeFetch = async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ response: { data: [{ id: 'x' }] } }), { status: 200 });
    };
    const controller = new PublicApiController(manifest, 'http://neo.local/etendo', fakeFetch as typeof fetch);
    await controller.create(entity, { data: { type: entity, relationships: { [field]: { data: { type: relationship.resource, id: 'rel-1' } } } } } as any, { neoJwt: 'jwt' } as any);
    assert.deepEqual(bodies, [{ [definition.internalPath]: 'rel-1' }]);
    await assert.rejects(
      () => controller.create(entity, { data: { type: entity, attributes: { [field]: 'rel-1' } } } as any, { neoJwt: 'jwt' } as any),
      /is a relationship/,
    );
  }
});

test('order warehouse is an optional create attribute and stays optional on PATCH', () => {
  for (const name of ['sales-order', 'purchase-order']) {
    const request = (path: string, method: string) =>
      (paths[path][method].requestBody!.content[MEDIA].schema.properties as any).data;
    const create = request(`/api/v1/${name}`, 'post');
    const patch = request(`/api/v1/${name}/{id}`, 'patch');
    assert.ok(!create.properties.attributes.required?.includes('warehouse'), name);
    assert.ok(!patch.properties.attributes.required?.includes('warehouse'), name);
    assert.ok(create.properties.attributes.properties.warehouse, name);
    assert.equal(create.properties.relationships?.properties.warehouse, undefined, name);
    assert.ok(paths[`/api/v1/${name}/lookups/warehouse`].get, name);
  }
  assert.equal(paths['/api/v1/warehouse'], undefined);
});

test('orders forward selected warehouse as an attribute and allow a partial PATCH omitting it', async () => {
  for (const name of ['sales-order', 'purchase-order']) {
    const bodies: Array<{ method: string; body: unknown }> = [];
    const fakeFetch = async (_url: string, init?: RequestInit) => {
      bodies.push({ method: init!.method!, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ response: { data: [{ id: 'order-1', warehouse: 'warehouse-1' }] } }), { status: 200 });
    };
    const controller = new PublicApiController(manifest, 'http://neo.local/etendo', fakeFetch as typeof fetch);
    await controller.create(name, { data: { type: name, attributes: { warehouse: 'warehouse-1' } } }, { neoJwt: 'jwt' } as any);
    await controller.patch(name, 'order-1', { data: { type: name, attributes: { order_date: '2026-11-06' } } },
      { neoJwt: 'jwt' } as any, toEtag('2026-11-06T10:00:00Z'));
    assert.equal(bodies[0].method, 'POST');
    assert.deepEqual(bodies[0].body, { warehouse: 'warehouse-1' });
    assert.equal(bodies[1].method, 'PATCH');
    assert.deepEqual(bodies[1].body, { orderDate: '2026-11-06', updated: '2026-11-06T10:00:00Z' });
  }
});

test('excluded resources answer 404 without forwarding to NEO', async () => {
  let calls = 0;
  const controller = new PublicApiController(manifest, 'http://neo.local/etendo', (async () => {
    calls += 1;
    throw new Error('excluded resources must never reach NEO');
  }) as typeof fetch);
  for (const name of ['warehouse', 'sales-invoice', 'purchase-invoice', 'goods-shipment', 'goods-receipt',
    'monitor-verifactu', 'sii-monitor', 'tbai-facturas-enviadas']) {
    await assert.rejects(() => controller.list(name, { neoJwt: 'jwt' } as any),
      (error: any) => error.getStatus() === 404, name);
  }
  assert.equal(calls, 0);
});
