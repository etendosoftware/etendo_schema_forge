import type { PublicApiSchema } from '@etendosoftware/api-gateway-core';
import {
  DEFAULT_PAGE_SIZE, MAX_FILTERS, MAX_PAGE_SIZE, MAX_SORT_FIELDS, filterOperatorsFor, isReadable, isSortable, kindOf,
} from '../public-api/json-api-query.ts';

type JsonSchema = {
  type: 'array' | 'object' | 'string';
  properties?: Record<string, FieldSchema>;
  items?: { type: 'object'; properties: Record<string, FieldSchema> };
  required?: string[];
};

type FieldSchema = { type: string; format?: string; enum?: string[]; description?: string; properties?: Record<string, FieldSchema>; items?: FieldSchema };

export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required?: boolean;
  description?: string;
  schema: { type: string; format?: string; minimum?: number; maximum?: number; default?: number; enum?: string[] };
}

export interface OpenApiOperation {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  parameters?: OpenApiParameter[];
  requestBody?: { required: boolean; content: Record<string, { schema: JsonSchema }> };
  responses: Record<string, {
    description: string;
    headers?: Record<string, { description: string; schema: { type: string } }>;
    content?: Record<string, { schema: JsonSchema }>;
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
  processes?: Array<{ action?: string; method?: string }>;
};

// Success and error documents are application/vnd.api+json; application/json is
// listed too because the gateway accepts it on requests and for Accept.
const JSON_API_MEDIA_TYPE = 'application/vnd.api+json';

function mediaContent(schema: JsonSchema) {
  return { [JSON_API_MEDIA_TYPE]: { schema }, 'application/json': { schema } };
}

function response(description: string, schema: JsonSchema, status = '200') {
  return { [status]: { description, content: mediaContent(schema) } };
}

function jsonApiRequestBody(resource: JsonSchema) {
  return { required: true, content: mediaContent({ type: 'object', required: ['data'], properties: { data: resource as any } }) };
}

// JSON:API error document, produced by the gateway for every failure
// (see json-api-http.ts). `detail` carries Etendo's own message for 4xx.
const ERROR_DOCUMENT_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['errors'],
  properties: {
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'HTTP status as a string.' },
          code: { type: 'string', description: 'Etendo error code when it provides one (for example stale_record).' },
          title: { type: 'string' },
          detail: { type: 'string', description: "Etendo's message for the failure." },
          source: { type: 'object', description: 'source.parameter names the query parameter at fault for a 400 on a list request.' },
          meta: { type: 'object', description: 'Optional hint and explanation from Etendo.' },
        },
      },
    },
  } as Record<string, FieldSchema>,
};

const ERROR_DESCRIPTIONS: Record<string, string> = {
  '400': 'Invalid request: unknown or read-only field, invalid query parameter (source.parameter names it), malformed body, or a value Etendo rejected.',
  '401': 'Missing, malformed or invalid API key.',
  '402': 'The tenant is blocked (payment required).',
  '403': 'The credential has no access to this resource, operation or organization, or lacks the public-api:process scope for an action.',
  '404': 'The resource or record does not exist, or the operation is not exposed.',
  '406': 'Accept does not allow application/vnd.api+json or application/json.',
  '409': 'Conflict: the resource type or id does not match, or the record is in use.',
  '415': 'The request body is not application/vnd.api+json or application/json.',
  '422': 'Etendo understood the request but refused it (validation).',
  '429': 'The API key exceeded its rate limit. Wait Retry-After seconds before retrying.',
  '502': 'Etendo could not complete the request. When meta.hint is present the write may already be saved: read the record before re-sending.',
  '503': 'Etendo is temporarily unavailable (database timeout or lost connection). Retry later.',
};

// Statuses each kind of operation can answer, besides its success status.
const READ_ERRORS = ['400', '401', '402', '403', '404', '406', '429', '502', '503'];
const WRITE_ERRORS = ['400', '401', '402', '403', '404', '406', '409', '415', '422', '429', '502', '503'];
const DELETE_ERRORS = ['400', '401', '402', '403', '404', '406', '409', '429', '502', '503'];

const RATE_LIMIT_HEADERS = {
  'Retry-After': { description: 'Seconds to wait before retrying.', schema: { type: 'integer' } },
  'X-RateLimit-Limit': { description: 'Requests allowed per window for this API key.', schema: { type: 'integer' } },
  'X-RateLimit-Remaining': { description: 'Requests left in the current window.', schema: { type: 'integer' } },
  'X-RateLimit-Reset': { description: 'Seconds until the window resets.', schema: { type: 'integer' } },
};
const ERRORS_BY_METHOD: Record<string, string[]> = { get: READ_ERRORS, delete: DELETE_ERRORS };

function errorResponsesFor(method: string): OpenApiOperation['responses'] {
  const statuses = ERRORS_BY_METHOD[method] ?? WRITE_ERRORS;
  return Object.fromEntries(statuses.map((status) => [
    status,
    {
      description: ERROR_DESCRIPTIONS[status],
      ...(status === '429' ? { headers: RATE_LIMIT_HEADERS } : {}),
      content: mediaContent(ERROR_DOCUMENT_SCHEMA),
    },
  ]));
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
  '412': { description: 'If-Match does not match the current version: the record changed since it was read, or the value is not a valid ETag.', content: mediaContent(ERROR_DOCUMENT_SCHEMA) },
  '428': { description: 'If-Match is missing, or is `*`, which is not accepted.', content: mediaContent(ERROR_DOCUMENT_SCHEMA) },
};

function withEtagHeader(responses: OpenApiOperation['responses']) {
  for (const value of Object.values(responses)) value.headers = { ...value.headers, ...ETAG_HEADER };
  return responses;
}

function isVersioned(entity: PublicApiEntity): boolean {
  return Boolean(entity.fields.updated);
}


const LIST_META_LINKS: Record<string, FieldSchema> = {
  meta: {
    type: 'object',
    description: 'meta.page: number, size and total (exact record count).',
    properties: { page: { type: 'object', properties: { number: { type: 'integer' }, size: { type: 'integer' }, total: { type: 'integer' } } } },
  },
  links: {
    type: 'object',
    description: 'Pagination links (self, first, prev, next, last); they keep your other query parameters. prev and next are null when there is no such page.',
    properties: { self: { type: 'string' }, first: { type: 'string' }, prev: { type: 'string' }, next: { type: 'string' }, last: { type: 'string' } },
  },
};

const FORMATS: Record<string, string> = {
  string: 'text', integer: 'integer', number: 'number', boolean: 'true or false',
  date: 'a calendar date yyyy-MM-dd', 'date-time': 'a calendar date yyyy-MM-dd (matches the whole day)', relationship: 'a record id',
};

/** Query parameters of a list operation: pagination, sort and one filter per readable field. */
function listQueryParameters(entity: PublicApiEntity): OpenApiParameter[] {
  const readable = Object.entries(entity.fields).filter(([, field]) => isReadable(field as never) && kindOf(field as never));
  const parameters: OpenApiParameter[] = [
    { name: 'page[number]', in: 'query', required: false, description: 'Page to read, starting at 1.', schema: { type: 'integer', minimum: 1, default: 1 } },
    { name: 'page[size]', in: 'query', required: false, description: `Records per page (maximum ${MAX_PAGE_SIZE}).`, schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE } },
    {
      name: 'sort', in: 'query', required: false,
      description: `Comma-separated field names, a leading "-" for descending (for example "name,-id"); up to ${MAX_SORT_FIELDS}. Sortable fields: ${Object.entries(entity.fields).filter(([, field]) => isSortable(field as never)).map(([name]) => name).join(', ') || 'none'}.`,
      schema: { type: 'string' },
    },
  ];
  for (const [name, field] of readable) {
    const operators = filterOperatorsFor(field as never);
    const kind = kindOf(field as never);
    if (!operators.length || !kind) continue;
    parameters.push({
      name: `filter[${name}]`, in: 'query', required: false,
      description: `Records whose ${name} equals the value (${FORMATS[kind]}). Other operators: filter[${name}][<operator>]=<value> with ${operators.join(', ')} (in takes a comma-separated list). At most ${MAX_FILTERS} filters per request.`,
      schema: { type: 'string' },
    });
  }
  return parameters;
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
        parameters: listQueryParameters(entity),
        responses: response(`${title} records filtered to curated public API fields`, { type: 'object', properties: { data: { type: 'array', items: resourceSchema(entityName, entity, properties) as any }, ...LIST_META_LINKS } }),
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
        requestBody: jsonApiRequestBody(resourceSchema(entityName, entity, properties, { request: true })),
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
        requestBody: jsonApiRequestBody(resourceSchema(entityName, entity, properties, { request: true })),
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
    for (const [method, operation] of [...Object.entries(collection), ...Object.entries(item)]) {
      Object.assign(operation.responses, errorResponsesFor(method));
    }
    for (const operation of Object.values(collection)) {
      operation.parameters = [...parentParameter, ...(operation.parameters ?? [])];
    }
    for (const operation of Object.values(item)) {
      operation.parameters = [...parentParameter, ...(operation.parameters ?? [])];
    }
    // Business actions: top-level resources only (children are not addressable for actions).
    if (!entity.parent) {
      for (const process of entity.processes ?? []) {
        if (!process.action || process.method?.toUpperCase() !== 'POST') continue;
        const actionPath = `${itemPath}/actions/${process.action}`;
        paths[actionPath] = {
          post: {
            operationId: `${process.action.replace(/-/g, '_')}_${entityName}`,
            summary: `${process.action} ${title}`,
            tags: [tag],
            description: `Runs the "${process.action}" action on the record, synchronously. No request body is needed. Requires the public-api:process scope (a write-only key gets 403). Answers the record after the action; meta.message carries Etendo's message and meta.alreadyApplied is true when the record was already in the target state (so a retry is safe).`,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: {
              ...response(`${title} record after the action, with meta.message`, {
                type: 'object',
                properties: { data: resourceSchema(entityName, entity, properties) as any, meta: { type: 'object', description: 'message, alreadyApplied (when the record was already in the target state) or hint (action done but the record could not be read back).' } },
              }),
              ...errorResponsesFor('post'),
            },
            security: [{ bearerAuth: [] }],
          },
        };
      }
    }
    if (Object.keys(collection).length) paths[basePath] = collection;
    if (Object.keys(item).length) paths[itemPath] = item;
  }
  return paths;
}
