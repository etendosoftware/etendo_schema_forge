// @covers gateway/src/openapi/build-per-entity-paths.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPerEntityOpenApiPaths } from '../../src/openapi/build-per-entity-paths.ts';
import type { PublicApiSchema } from '@etendosoftware/api-gateway-core';

const schema: PublicApiSchema = {
  apiVersion: 'v1',
  entities: {
    product: {
      publicApi: true,
      specName: 'product',
      operations: ['GET', 'LIST'],
      fields: {
        searchKey: { publicApi: true, direction: 'out', internalPath: 'searchKey', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
        name: { publicApi: true, direction: 'out', internalPath: 'name', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
      },
      functional: { functionalName: 'Products', functionalSummary: 'Maintain the product catalog.', functionalCapabilities: ['Create products.', 'Review products.'] },
    },
    businessPartner: {
      publicApi: true,
      specName: 'contacts',
      operations: ['GET', 'LIST'],
      fields: {
        name: { publicApi: true, direction: 'out', internalPath: 'name', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
        tax_id: { publicApi: true, direction: 'out', internalPath: 'taxID', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
      },
      functional: { functionalName: 'Contacts', functionalSummary: 'Maintain customers and vendors.', functionalCapabilities: ['Create contacts.'] },
    },
  },
};

test('produces one path per schema entity, keyed by literal entity name', () => {
  const paths = buildPerEntityOpenApiPaths(schema);
  assert.deepEqual(Object.keys(paths).sort(), [
    '/api/v1/businessPartner',
    '/api/v1/businessPartner/{id}',
    '/api/v1/product',
    '/api/v1/product/{id}',
  ]);
});

test('each path has a GET operation with a response schema listing the entity\'s public field names', () => {
  const paths = buildPerEntityOpenApiPaths(schema);
  const productProps = paths['/api/v1/product'].get.responses['200'].content['application/json'].schema.properties.data.items.properties.attributes.properties;
  assert.deepEqual(Object.keys(productProps).sort(), ['name', 'searchKey']);

  const bpProps = paths['/api/v1/businessPartner'].get.responses['200'].content['application/json'].schema.properties.data.items.properties.attributes.properties;
  assert.deepEqual(Object.keys(bpProps).sort(), ['name', 'tax_id']);
});

test('uses functional names and descriptions instead of raw entity names', () => {
  const paths = buildPerEntityOpenApiPaths(schema);
  assert.equal(paths['/api/v1/product'].get.summary, 'List Products');
  assert.equal(paths['/api/v1/product'].get.tags[0], 'Products');
  assert.match(paths['/api/v1/product'].get.description, /Maintain the product catalog/);
});

test('uses declared field data types in response schemas', () => {
  const typedSchema = structuredClone(schema);
  typedSchema.entities.product.fields.active = { publicApi: true, direction: 'out', internalPath: 'active', type: 'passthrough', dataType: { type: 'boolean' } };
  typedSchema.entities.product.fields.weight = { publicApi: true, direction: 'out', internalPath: 'weight', type: 'passthrough', dataType: { type: 'number', format: 'double' } };
  const properties = buildPerEntityOpenApiPaths(typedSchema)['/api/v1/product'].get.responses['200'].content['application/json'].schema.properties.data.items.properties.attributes.properties;
  assert.deepEqual(properties.active, { type: 'boolean' });
  assert.deepEqual(properties.weight, { type: 'number', format: 'double' });
});

test('does not leak internal fields not marked publicApi', () => {
  const paths = buildPerEntityOpenApiPaths(schema);
  const productProps = paths['/api/v1/product'].get.responses['200'].content['application/json'].schema.properties.data.items.properties.attributes.properties;
  assert.equal(productProps.internalCostBasis, undefined);
});

test('documents CRUD verbs on the correct collection and item paths', () => {
  const crudSchema = structuredClone(schema);
  crudSchema.entities.product.operations = ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const paths = buildPerEntityOpenApiPaths(crudSchema);
  assert.deepEqual(Object.keys(paths['/api/v1/product']).sort(), ['get', 'post']);
  assert.deepEqual(Object.keys(paths['/api/v1/product/{id}']).sort(), ['delete', 'get', 'patch', 'put']);
  assert.equal(paths['/api/v1/product'].post.requestBody?.required, true);
  assert.equal(paths['/api/v1/product/{id}'].delete.responses['204'].description, 'Products record deleted');
});

test('documents public foreign keys as JSON:API relationships', () => {
  const relationshipSchema = structuredClone(schema);
  relationshipSchema.entities.product.fields.category = {
    publicApi: true, direction: 'out', internalPath: 'productCategory', type: 'passthrough', handlerId: null,
    relationship: { resource: 'product-category', cardinality: 'one', foreignKey: 'category' },
  } as any;
  const responseSchema = buildPerEntityOpenApiPaths(relationshipSchema)['/api/v1/product'].get.responses['200'].content['application/json'].schema;
  assert.deepEqual(responseSchema.properties.data.items.properties.relationships.properties.category.properties.data.properties, {
    type: { type: 'string', enum: ['product-category'], description: 'Resource type: product-category.' },
    id: { type: 'string' },
  });
  assert.equal(responseSchema.properties.data.items.properties.attributes.properties.category, undefined);
});

test('groups a child resource under its master and documents the parent id', () => {
  const childSchema = structuredClone(schema) as any;
  childSchema.entities.product.operations = ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'];
  childSchema.entities.productLines = {
    publicApi: true,
    publicName: 'product-lines',
    specName: 'product',
    entityName: 'lines',
    operations: ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'],
    parent: { resource: 'product', pathSegment: 'lines', foreignKey: 'product' },
    fields: {
      quantity: { publicApi: true, direction: 'inout', internalPath: 'quantity', type: 'passthrough', dataType: { type: 'number' }, handlerId: null },
    },
    functional: { functionalName: 'Products — Lines' },
  };
  const paths = buildPerEntityOpenApiPaths(childSchema);
  const collection = paths['/api/v1/product/{parentId}/lines'];
  const item = paths['/api/v1/product/{parentId}/lines/{id}'];
  assert.ok(collection);
  assert.ok(item);
  assert.deepEqual(Object.keys(collection).sort(), ['get', 'post']);
  assert.deepEqual(Object.keys(item).sort(), ['delete', 'get', 'patch', 'put']);
  assert.equal(collection.post.tags[0], 'Products');
  assert.deepEqual(collection.post.parameters, [{ name: 'parentId', in: 'path', required: true, schema: { type: 'string' } }]);
  assert.equal(paths['/api/v1/product-lines'], undefined);
});

test('documents PATCH for writable child resources in the public contract', () => {
  const childSchema = structuredClone(schema) as any;
  childSchema.entities.productLines = {
    publicApi: true,
    publicName: 'product-lines',
    specName: 'product',
    entityName: 'lines',
    operations: ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'],
    parent: { resource: 'product', pathSegment: 'lines', foreignKey: 'product' },
    fields: {
      quantity: { publicApi: true, direction: 'inout', internalPath: 'quantity', type: 'passthrough', dataType: { type: 'number' }, handlerId: null },
    },
    functional: { functionalName: 'Products — Lines' },
  };
  const item = buildPerEntityOpenApiPaths(childSchema)['/api/v1/product/{parentId}/lines/{id}'];
  assert.ok(item.patch);
});

// ---- ETP-5369: JSON:API errors, media types and request shape ---------------

const writableSchema = (() => {
  const crud = structuredClone(schema);
  crud.entities.product.operations = ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'];
  return crud;
})();

test('every operation documents the error responses it can answer, as JSON:API error documents', () => {
  const paths = buildPerEntityOpenApiPaths(writableSchema);
  const read = ['400', '401', '402', '403', '404', '406', '502'];
  const write = ['400', '401', '402', '403', '404', '406', '409', '415', '422', '502'];
  const remove = ['400', '401', '402', '403', '404', '406', '409', '502'];
  const expected: Array<[string, string, string[]]> = [
    ['/api/v1/product', 'get', read], ['/api/v1/product/{id}', 'get', read],
    ['/api/v1/product', 'post', write], ['/api/v1/product/{id}', 'put', write], ['/api/v1/product/{id}', 'patch', write],
    ['/api/v1/product/{id}', 'delete', remove],
  ];
  for (const [path, method, statuses] of expected) {
    const responses = paths[path][method].responses;
    for (const status of statuses) {
      assert.ok(responses[status], `${method} ${path} documents ${status}`);
      const content = responses[status].content!;
      assert.deepEqual(Object.keys(content).sort(), ['application/json', 'application/vnd.api+json']);
      assert.equal(content['application/vnd.api+json'].schema.required?.[0], 'errors');
    }
  }
});

test('DELETE documents 204 with no body and no other success status', () => {
  const remove = buildPerEntityOpenApiPaths(writableSchema)['/api/v1/product/{id}'].delete;
  const success = Object.keys(remove.responses).filter((status) => status.startsWith('2'));
  assert.deepEqual(success, ['204']);
  assert.equal(remove.responses['204'].content, undefined);
});

test('request bodies are JSON:API documents with a required data member and no required attributes', () => {
  const paths = buildPerEntityOpenApiPaths(writableSchema);
  for (const operation of [paths['/api/v1/product'].post, paths['/api/v1/product/{id}'].put, paths['/api/v1/product/{id}'].patch]) {
    const content = operation.requestBody!.content;
    assert.deepEqual(Object.keys(content).sort(), ['application/json', 'application/vnd.api+json']);
    const body = content['application/vnd.api+json'].schema;
    assert.deepEqual(body.required, ['data']);
    const resource = body.properties!.data as unknown as { required?: string[]; properties: Record<string, unknown> };
    assert.equal(resource.required, undefined, 'attributes may be omitted (relationships-only bodies)');
    assert.ok('attributes' in resource.properties);
  }
});

test('a single-record response documents data as one object and a collection as an array', () => {
  const paths = buildPerEntityOpenApiPaths(writableSchema);
  const single = paths['/api/v1/product/{id}'].get.responses['200'].content!['application/vnd.api+json'].schema.properties!.data as any;
  const list = paths['/api/v1/product'].get.responses['200'].content!['application/vnd.api+json'].schema.properties!.data as any;
  assert.equal(single.type, 'object');
  assert.equal(list.type, 'array');
});

test('declares one POST path per top-level action and none for children', () => {
  const withActions = structuredClone(schema) as any;
  withActions.entities.product.processes = [{ action: 'complete', method: 'POST', path: '/header/:id/action/documentAction', body: { docAction: 'CO' } }];
  withActions.entities.child = {
    publicApi: true, specName: 'product', operations: ['GET', 'LIST'], fields: {},
    parent: { resource: 'product', pathSegment: 'lines', foreignKey: 'p' },
    processes: [{ action: 'complete', method: 'POST', path: '/x/:id/action/documentAction' }],
  };
  const paths = buildPerEntityOpenApiPaths(withActions);
  const action = (paths['/api/v1/product/{id}/actions/complete'] as any).post;
  assert.equal(action.operationId, 'complete_product');
  assert.deepEqual(action.security, [{ bearerAuth: [] }]);
  assert.ok(action.responses['200'] && action.responses['403'] && action.responses['422']);
  assert.deepEqual(action.parameters.map((p: any) => p.name), ['id']);
  assert.equal(Object.keys(paths).filter((p) => p.includes('/actions/')).length, 1);
  assert.equal(paths['/api/v1/businessPartner/{id}'] && Object.keys(paths).some((p) => p.startsWith('/api/v1/businessPartner/{id}/actions')), false);
});
