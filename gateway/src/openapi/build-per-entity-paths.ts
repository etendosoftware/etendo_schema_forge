import type { PublicApiSchema } from '@etendosoftware/api-gateway-core';

type JsonSchema = {
  type: 'array' | 'object' | 'string';
  properties?: Record<string, FieldSchema>;
  items?: { type: 'object'; properties: Record<string, FieldSchema> };
};

type FieldSchema = { type: string; format?: string; enum?: string[]; description?: string; properties?: Record<string, FieldSchema>; items?: FieldSchema };

export interface OpenApiOperation {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  parameters?: Array<{ name: string; in: 'path' | 'header'; required: true; description?: string; schema: { type: 'string' } }>;
  requestBody?: { required: boolean; content: { 'application/json': { schema: { type: 'object'; properties: Record<string, FieldSchema> } } } };
  responses: Record<string, {
    description: string;
    headers?: Record<string, { description: string; schema: { type: 'string' } }>;
    content?: { 'application/json': { schema: JsonSchema } };
  }>;
  security: Array<Record<string, string[]>>;
}

export interface OpenApiPathItem { [method: string]: OpenApiOperation; }

type FunctionalDocumentation = {
  functionalName?: string;
  functionalSummary?: string;
  functionalCapabilities?: string[];
};

type PublicApiEntity = PublicApiSchema['entities'][string] & {
  functional?: FunctionalDocumentation;
  parent?: { resource: string; pathSegment: string; foreignKey: string };
  group?: string;
};

function response(description: string, schema: JsonSchema, status = '200') {
  return { [status]: { description, content: { 'application/json': { schema } } } };
}

// Optimistic concurrency (see the controller): resources that publish
// `updated` return an opaque ETag and require it back in If-Match on updates.
const ETAG_HEADER = {
  ETag: {
    description: 'Opaque version of the record. Send it back in If-Match to update the record.',
    schema: { type: 'string' as const },
  },
};
const IF_MATCH_PARAMETER = {
  name: 'If-Match',
  in: 'header' as const,
  required: true as const,
  description: 'ETag returned when the record was read (ETag header or meta.etag).',
  schema: { type: 'string' as const },
};
const PRECONDITION_RESPONSES = {
  '412': { description: 'If-Match does not match the current version: the record changed since it was read, or the value is not a valid ETag. Error codes: `stale_record`, `precondition_failed`.' },
  '428': { description: 'If-Match is missing, or is `*`, which is not accepted. Error code: `precondition_required`.' },
};

function withEtagHeader(responses: OpenApiOperation['responses']) {
  for (const value of Object.values(responses)) value.headers = { ...ETAG_HEADER };
  return responses;
}

function isVersioned(entity: PublicApiEntity): boolean {
  return Boolean(entity.fields.updated);
}

// `meta.etag` is response-only: the version travels in If-Match, never in a body.
function resourceSchema(
  entityName: string,
  entity: PublicApiEntity,
  properties: Record<string, FieldSchema>,
  { request = false }: { request?: boolean } = {},
): JsonSchema {
  const relationshipProperties: Record<string, FieldSchema> = {};
  const attributeProperties = { ...properties };
  for (const [fieldName, field] of Object.entries(entity.fields) as Array<[string, typeof entity.fields[string] & { relationship?: { resource: string; foreignKey?: string } }]>) {
    if (!field.relationship) continue;
    delete attributeProperties[fieldName];
    relationshipProperties[fieldName] = {
      type: 'object',
      description: `Relationship to ${field.relationship.resource}. Foreign key: ${field.relationship.foreignKey ?? fieldName}.`,
      properties: {
        data: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [field.relationship.resource], description: `Resource type: ${field.relationship.resource}.` },
            id: { type: 'string' },
          },
        },
      },
    };
  }
  return {
    type: 'object',
    properties: {
      type: { type: 'string', enum: [entityName], description: `Resource type: ${entityName}.` },
      id: { type: 'string' },
      attributes: { type: 'object', properties: attributeProperties },
      ...(Object.keys(relationshipProperties).length
        ? { relationships: { type: 'object', properties: relationshipProperties } }
        : {}),
      ...(isVersioned(entity) && !request
        ? { meta: { type: 'object', properties: { etag: { type: 'string', description: 'Same value as the ETag header; send it in If-Match to update this record.' } } } }
        : {}),
    },
  };
}

export function buildPerEntityOpenApiPaths(schema: PublicApiSchema): Record<string, OpenApiPathItem> {
  const paths: Record<string, OpenApiPathItem> = {};
  for (const [entityName, rawEntity] of Object.entries(schema.entities)) {
    const entity = rawEntity as PublicApiEntity;
    const parent = entity.parent ? schema.entities[entity.parent.resource] as PublicApiEntity | undefined : undefined;
    const title = entity.functional?.functionalName ?? entityName;
    const groupTitle = entity.group ?? parent?.functional?.functionalName ?? title;
    const summary = entity.functional?.functionalSummary;
    const capabilities = entity.functional?.functionalCapabilities ?? [];
    const description = [
      summary,
      capabilities.length ? `This window supports:\n${capabilities.map((capability) => `- ${capability}`).join('\n')}` : undefined,
    ].filter(Boolean).join('\n\n');
    // Children stay inside the master's Scalar tag. Their URL is nested and
    // carries the parent id, so the docs describe a business operation rather
    // than a second unrelated/raw entity.
    const tag = groupTitle;
    const properties: Record<string, FieldSchema> = {};
    for (const [fieldName, field] of Object.entries(entity.fields)) {
      // JSON:API represents the identifier at resource level, never inside
      // attributes. The manifest keeps it for response filtering, but the
      // OpenAPI attribute schema must not duplicate it.
      if (fieldName === 'id') continue;
      properties[fieldName] = (field as typeof field & { dataType?: FieldSchema }).dataType ?? { type: 'string' };
    }
    const allowed = new Set(entity.operations.map((operation) => operation.toUpperCase()));
    const can = (operation: string) => allowed.has(operation) || (operation === 'GET' && allowed.has('LIST'));
    const collection: OpenApiPathItem = {};
    const item: OpenApiPathItem = {};

    if (can('GET')) {
      collection.get = {
        operationId: `list_${entityName}`, summary: `List ${title}`,
        tags: [tag], description,
        responses: response(`${title} records filtered to curated public API fields`, { type: 'object', properties: { data: { type: 'array', items: resourceSchema(entityName, entity, properties) as any } } }),
        security: [{ bearerAuth: [] }],
      };
      item.get = {
        operationId: `get_${entityName}`, summary: `Get ${title}`,
        tags: [tag], description,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: response(`${title} record filtered to curated public API fields`, { type: 'object', properties: { data: resourceSchema(entityName, entity, properties) as any } }),
        security: [{ bearerAuth: [] }],
      };
      if (isVersioned(entity)) withEtagHeader(item.get.responses);
    }
    if (can('POST')) {
      collection.post = {
        operationId: `create_${entityName}`, summary: `Create ${title}`,
        tags: [tag], description,
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { data: resourceSchema(entityName, entity, properties, { request: true }) as any } } } } },
        responses: response(`${title} record created`, { type: 'object', properties: { data: resourceSchema(entityName, entity, properties) as any } }, '201'),
        security: [{ bearerAuth: [] }],
      };
      if (isVersioned(entity)) withEtagHeader(collection.post.responses);
    }
    for (const method of ['PUT', 'PATCH'] as const) {
      if (!can(method)) continue;
      item[method.toLowerCase()] = {
        operationId: `${method.toLowerCase()}_${entityName}`, summary: `${method === 'PATCH' ? 'Partially update' : 'Update'} ${title}`,
        tags: [tag], description,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { data: resourceSchema(entityName, entity, properties, { request: true }) as any } } } } },
        responses: response(`${title} record updated`, { type: 'object', properties: { data: resourceSchema(entityName, entity, properties) as any } }),
        security: [{ bearerAuth: [] }],
      };
      if (isVersioned(entity)) {
        const operation = item[method.toLowerCase()];
        operation.parameters = [...(operation.parameters ?? []), IF_MATCH_PARAMETER];
        withEtagHeader(operation.responses);
        Object.assign(operation.responses, structuredClone(PRECONDITION_RESPONSES));
      }
    }
    if (can('DELETE')) {
      item.delete = {
        operationId: `delete_${entityName}`, summary: `Delete ${title}`,
        tags: [tag], description,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: `${title} record deleted` } },
        security: [{ bearerAuth: [] }],
      };
    }
    const basePath = entity.parent
      ? `/api/v1/${entity.parent.resource}/{parentId}/${entity.parent.pathSegment}`
      : `/api/v1/${entityName}`;
    const itemPath = entity.parent
      ? `${basePath}/{id}`
      : `/api/v1/${entityName}/{id}`;
    const parentParameter = entity.parent
      ? [{ name: 'parentId', in: 'path' as const, required: true as const, schema: { type: 'string' as const } }]
      : [];
    for (const operation of Object.values(collection)) {
      operation.parameters = [...parentParameter, ...(operation.parameters ?? [])];
    }
    for (const operation of Object.values(item)) {
      operation.parameters = [...parentParameter, ...(operation.parameters ?? [])];
    }
    if (Object.keys(collection).length) paths[basePath] = collection;
    if (Object.keys(item).length) paths[itemPath] = item;
  }
  return paths;
}
