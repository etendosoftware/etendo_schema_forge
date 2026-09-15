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
        searchKey: { publicApi: true, direction: 'out', internalPath: 'searchKey', type: 'passthrough', handlerId: null },
        name: { publicApi: true, direction: 'out', internalPath: 'name', type: 'passthrough', handlerId: null },
      },
    },
    businessPartner: {
      publicApi: true,
      specName: 'contacts',
      operations: ['GET', 'LIST'],
      fields: {
        name: { publicApi: true, direction: 'out', internalPath: 'name', type: 'passthrough', handlerId: null },
        taxId: { publicApi: true, direction: 'out', internalPath: 'taxID', type: 'passthrough', handlerId: null },
      },
    },
  },
};

test('produces one path per schema entity, keyed by literal entity name', () => {
  const paths = buildPerEntityOpenApiPaths(schema);
  assert.deepEqual(Object.keys(paths).sort(), ['/api/v1/businessPartner', '/api/v1/product']);
});

test('each path has a GET operation with a response schema listing the entity\'s public field names', () => {
  const paths = buildPerEntityOpenApiPaths(schema);
  const productProps = paths['/api/v1/product'].get.responses['200'].content['application/json'].schema.items.properties;
  assert.deepEqual(Object.keys(productProps).sort(), ['name', 'searchKey']);

  const bpProps = paths['/api/v1/businessPartner'].get.responses['200'].content['application/json'].schema.items.properties;
  assert.deepEqual(Object.keys(bpProps).sort(), ['name', 'taxId']);
});

test('does not leak internal fields not marked publicApi', () => {
  const paths = buildPerEntityOpenApiPaths(schema);
  const productProps = paths['/api/v1/product'].get.responses['200'].content['application/json'].schema.items.properties;
  assert.equal(productProps.internalCostBasis, undefined);
});
