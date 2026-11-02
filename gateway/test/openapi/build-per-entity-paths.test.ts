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

function versionedSchema() {
  const versioned = structuredClone(schema) as any;
  versioned.entities.product.operations = ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'];
  versioned.entities.product.fields.updated = {
    publicApi: true, direction: 'out', internalPath: 'updated', type: 'passthrough', dataType: { type: 'string', format: 'date-time' }, handlerId: null,
  };
  versioned.entities.businessPartner.operations = ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'];
  return versioned;
}

test('requires If-Match and documents 412/428 on updates of a versioned resource', () => {
  const item = buildPerEntityOpenApiPaths(versionedSchema())['/api/v1/product/{id}'];
  for (const method of ['put', 'patch']) {
    const ifMatch = item[method].parameters?.find((parameter) => parameter.name === 'If-Match');
    assert.deepEqual({ in: ifMatch?.in, required: ifMatch?.required }, { in: 'header', required: true }, method);
    assert.ok(item[method].responses['412'], `${method} documents 412`);
    assert.ok(item[method].responses['428'], `${method} documents 428`);
    assert.match(item[method].responses['412'].description, /precondition_failed/, `${method} lists 412 codes`);
    assert.match(item[method].responses['428'].description, /precondition_required/, `${method} lists 428 code`);
    assert.ok(item[method].responses['200'].headers?.ETag, `${method} returns the new ETag`);
  }
});

test('returns the ETag on reads and creates of a versioned resource and exposes meta.etag', () => {
  const paths = buildPerEntityOpenApiPaths(versionedSchema());
  assert.ok(paths['/api/v1/product/{id}'].get.responses['200'].headers?.ETag);
  assert.ok(paths['/api/v1/product'].post.responses['201'].headers?.ETag);
  const data = paths['/api/v1/product/{id}'].get.responses['200'].content!['application/json'].schema.properties!.data as any;
  assert.ok(data.properties.meta.properties.etag);
});

test('does not ask for If-Match on resources that do not publish updated', () => {
  const item = buildPerEntityOpenApiPaths(versionedSchema())['/api/v1/businessPartner/{id}'];
  assert.equal(item.patch.parameters?.some((parameter) => parameter.name === 'If-Match'), false);
  assert.equal(item.patch.responses['428'], undefined);
  assert.equal(item.get.responses['200'].headers, undefined);
});

test('meta.etag is documented on responses only, never in a request body', () => {
  const paths = buildPerEntityOpenApiPaths(versionedSchema());
  const requestData = (operation: any) => operation.requestBody.content['application/json'].schema.properties.data;
  assert.equal(requestData(paths['/api/v1/product'].post).properties.meta, undefined);
  assert.equal(requestData(paths['/api/v1/product/{id}'].put).properties.meta, undefined);
  assert.equal(requestData(paths['/api/v1/product/{id}'].patch).properties.meta, undefined);
  const responseData = paths['/api/v1/product/{id}'].patch.responses['200'].content!['application/json'].schema.properties!.data as any;
  assert.ok(responseData.properties.meta.properties.etag);
});

test('a versioned child documents If-Match on its updates and never on DELETE', () => {
  const childSchema = versionedSchema();
  childSchema.entities.productLines = {
    publicApi: true,
    publicName: 'product-lines',
    specName: 'product',
    entityName: 'lines',
    operations: ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'],
    parent: { resource: 'product', pathSegment: 'lines', foreignKey: 'product' },
    fields: {
      quantity: { publicApi: true, direction: 'inout', internalPath: 'quantity', type: 'passthrough', dataType: { type: 'number' }, handlerId: null },
      updated: { publicApi: true, direction: 'out', internalPath: 'updated', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
    },
    functional: { functionalName: 'Products — Lines' },
  };
  const paths = buildPerEntityOpenApiPaths(childSchema);
  for (const item of [paths['/api/v1/product/{parentId}/lines/{id}'], paths['/api/v1/product/{id}']]) {
    for (const method of ['put', 'patch']) {
      assert.ok(item[method].parameters?.some((parameter) => parameter.name === 'If-Match'), method);
    }
    assert.equal(item.delete.parameters?.some((parameter) => parameter.name === 'If-Match'), false);
    assert.equal(item.delete.responses['428'], undefined);
  }
});

test('each update documents its own 412/428 objects', () => {
  const item = buildPerEntityOpenApiPaths(versionedSchema())['/api/v1/product/{id}'];
  assert.notEqual(item.put.responses['412'], item.patch.responses['412']);
  assert.notEqual(item.put.responses['428'], item.patch.responses['428']);
});

test('a read-only resource documents no write operation', () => {
  const paths = buildPerEntityOpenApiPaths(schema);
  assert.deepEqual(Object.keys(paths['/api/v1/product']), ['get']);
  assert.deepEqual(Object.keys(paths['/api/v1/product/{id}']), ['get']);
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

test('a list operation documents page, sort and one filter per readable filterable field', () => {
  const rich = structuredClone(schema) as any;
  rich.entities.product.fields.active = { publicApi: true, direction: 'inout', internalPath: 'isActive', type: 'passthrough', dataType: { type: 'boolean' } };
  rich.entities.product.fields.created = { publicApi: true, direction: 'out', internalPath: 'created', type: 'passthrough', dataType: { type: 'string', format: 'date-time' } };
  rich.entities.product.fields.secret = { publicApi: true, direction: 'in', internalPath: 'secret', type: 'passthrough', dataType: { type: 'string' } };
  rich.entities.product.fields.rel = { publicApi: true, direction: 'inout', internalPath: 'rel', type: 'passthrough', dataType: { type: 'string' }, relationship: { resource: 'product', cardinality: 'one', foreignKey: 'rel' } };
  rich.entities.product.fields.blob = { publicApi: true, direction: 'out', internalPath: 'blob', type: 'passthrough', dataType: { type: 'object' } };
  const parameters = buildPerEntityOpenApiPaths(rich)['/api/v1/product'].get.parameters as any[];
  const byName = Object.fromEntries(parameters.map((parameter) => [parameter.name, parameter]));
  assert.deepEqual(Object.keys(byName), ['page[number]', 'page[size]', 'sort', 'filter[searchKey]', 'filter[name]', 'filter[active]', 'filter[created]', 'filter[rel]']);
  for (const parameter of parameters) assert.deepEqual([parameter.in, parameter.required], ['query', false]);
  assert.deepEqual(byName['page[size]'].schema, { type: 'integer', minimum: 1, maximum: 100, default: 50 });
  assert.deepEqual(byName['page[number]'].schema, { type: 'integer', minimum: 1, default: 1 });
  assert.match(byName.sort.description, /Sortable fields: searchKey, name, active, created\./);
  assert.doesNotMatch(byName.sort.description, /secret|blob/);
  assert.doesNotMatch(byName.sort.description, /rel/);
  assert.match(byName['filter[name]'].description, /eq, ne, contains, in/);
  assert.match(byName['filter[active]'].description, /true or false/);
  assert.match(byName['filter[created]'].description, /yyyy-MM-dd/);
  assert.doesNotMatch(byName['filter[created]'].description, /contains|\bne\b/);
});

test('a list response documents meta.page and the pagination links; a single read does not', () => {
  const paths = buildPerEntityOpenApiPaths(schema);
  const list = paths['/api/v1/product'].get.responses['200'].content!['application/vnd.api+json'].schema.properties as any;
  assert.deepEqual(Object.keys(list.links.properties), ['self', 'first', 'prev', 'next', 'last']);
  assert.deepEqual(Object.keys(list.meta.properties.page.properties), ['number', 'size', 'total']);
  const single = paths['/api/v1/product/{id}'].get.responses['200'].content!['application/vnd.api+json'].schema.properties as any;
  assert.equal(single.links, undefined);
  assert.equal(paths['/api/v1/product/{id}'].get.parameters!.some((p) => p.in === 'query'), false);
});

test('a child list keeps its parentId path parameter ahead of the query parameters', () => {
  const withChild = structuredClone(schema) as any;
  withChild.entities.line = {
    publicApi: true, specName: 'product', operations: ['GET', 'LIST'],
    parent: { resource: 'product', pathSegment: 'lines', foreignKey: 'p' },
    fields: { qty: { publicApi: true, direction: 'inout', internalPath: 'qty', type: 'passthrough', dataType: { type: 'integer' } } },
  };
  const parameters = buildPerEntityOpenApiPaths(withChild)['/api/v1/product/{parentId}/lines'].get.parameters as any[];
  assert.deepEqual(parameters.map((p) => `${p.in}:${p.name}`), ['path:parentId', 'query:page[number]', 'query:page[size]', 'query:sort', 'query:filter[qty]']);
});

test('every operation documents 429 with its rate-limit headers; list operations document 400 as a query error', () => {
  const crud = structuredClone(schema) as any;
  crud.entities.product.operations = ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const paths = buildPerEntityOpenApiPaths(crud);
  for (const path of Object.values(paths)) {
    for (const operation of Object.values(path)) {
      const answer = operation.responses['429'];
      assert.ok(answer, `${operation.operationId} documents 429`);
      assert.deepEqual(Object.keys(answer.headers!), ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']);
      assert.ok(answer.content!['application/vnd.api+json']);
    }
  }
  assert.match(paths['/api/v1/product'].get.responses['400'].description, /source\.parameter/);
});

test('a write body lists only writable fields, marks the declared required ones (not on PATCH), and a response lists only readable fields', () => {
  const writable: PublicApiSchema = {
    apiVersion: 'v1',
    entities: {
      product: {
        publicApi: true,
        specName: 'product',
        operations: ['GET', 'LIST', 'POST', 'PUT', 'PATCH'],
        fields: {
          search_key: { publicApi: true, direction: 'inout', required: true, internalPath: 'searchKey', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
          name: { publicApi: true, direction: 'inout', internalPath: 'name', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
          sale_price: { publicApi: true, direction: 'out', internalPath: 'salePrice', type: 'passthrough', dataType: { type: 'number' }, handlerId: null },
          secret_input: { publicApi: true, direction: 'in', internalPath: 'secretInput', type: 'passthrough', dataType: { type: 'string' }, handlerId: null },
          category: { publicApi: true, direction: 'out', internalPath: 'productCategory', type: 'passthrough', dataType: { type: 'string' }, handlerId: null, relationship: { resource: 'product', cardinality: 'one', foreignKey: 'category' } },
          brand: { publicApi: true, direction: 'inout', required: true, internalPath: 'brand', type: 'passthrough', dataType: { type: 'string' }, handlerId: null, relationship: { resource: 'product', cardinality: 'one', foreignKey: 'brand' } },
        },
      },
    },
  } as unknown as PublicApiSchema;
  const paths = buildPerEntityOpenApiPaths(writable);
  const body = paths['/api/v1/product'].post.requestBody!.content['application/json'].schema.properties!.data as any;
  assert.deepEqual(Object.keys(body.properties.attributes.properties).sort(), ['name', 'search_key', 'secret_input']);
  assert.deepEqual(body.properties.attributes.required, ['search_key']);
  assert.deepEqual(Object.keys(body.properties.relationships.properties), ['brand'], 'a read-only relationship is not offered on write');
  assert.deepEqual(body.properties.relationships.required, ['brand'], 'a required writable relationship is listed on POST');
  const put = paths['/api/v1/product/{id}'].put.requestBody!.content['application/json'].schema.properties!.data as any;
  assert.deepEqual(put.properties.attributes.required, ['search_key'], 'a full update lists the required fields too');
  assert.deepEqual(put.properties.relationships.required, ['brand']);
  const patch = paths['/api/v1/product/{id}'].patch.requestBody!.content['application/json'].schema.properties!.data as any;
  assert.equal(patch.properties.attributes.required, undefined, 'a partial update requires nothing');
  assert.equal(patch.properties.relationships.required, undefined);

  const read = paths['/api/v1/product/{id}'].get.responses['200'].content!['application/json'].schema.properties!.data as any;
  assert.deepEqual(Object.keys(read.properties.attributes.properties).sort(), ['name', 'sale_price', 'search_key']);
  assert.equal(read.properties.attributes.required, undefined);
  assert.ok(read.properties.relationships.properties.category);
});
