import type { PublicApiSchema } from '@etendosoftware/api-gateway-core';

// OpenAPI 3.0 Path Item Object, narrowed to what this builder emits. No official
// @nestjs/swagger type is exported for a raw path-item literal, so this is a
// minimal local shape rather than `any`.
export interface OpenApiPathItem {
  get: {
    operationId: string;
    summary: string;
    responses: {
      '200': {
        description: string;
        content: {
          'application/json': {
            schema: {
              type: 'array';
              items: {
                type: 'object';
                // Field types aren't tracked in the resolved PublicApiSchema yet
                // (ETP-5345 v1) — `string` is a deliberate placeholder for every
                // field rather than invented per-field precision.
                properties: Record<string, { type: 'string' }>;
              };
            };
          };
        };
      };
    };
  };
}

export function buildPerEntityOpenApiPaths(schema: PublicApiSchema): Record<string, OpenApiPathItem> {
  const paths: Record<string, OpenApiPathItem> = {};
  for (const [entityName, entity] of Object.entries(schema.entities)) {
    const properties: Record<string, { type: 'string' }> = {};
    for (const fieldName of Object.keys(entity.fields)) {
      properties[fieldName] = { type: 'string' };
    }
    paths[`/api/v1/${entityName}`] = {
      get: {
        operationId: `list_${entityName}`,
        summary: `List ${entityName} records`,
        responses: {
          '200': {
            description: `Array of ${entityName} records, filtered to the curated publicApi fields`,
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties,
                  },
                },
              },
            },
          },
        },
      },
    };
  }
  return paths;
}
