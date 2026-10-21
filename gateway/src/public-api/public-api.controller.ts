import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  PreconditionFailedException,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  PUBLIC_API_SCHEMA,
  PublicApiKeyGuard,
  type PublicApiEntity,
  type PublicApiField,
  filterOutboundRecord,
  type PublicApiSchema,
} from '@etendosoftware/api-gateway-core';

import { PublicApiThrottlerGuard } from './public-api-throttler.guard.ts';
import {
  JsonApiExceptionFilter,
  JsonApiNegotiationGuard,
  JsonApiResponseInterceptor,
  badGateway,
  parseUpstreamError,
  upstreamException,
  type JsonApiError,
} from './json-api-http.ts';
import { neoListParams, pagination, parseListQuery, type ListQuery } from './json-api-query.ts';
import { mapAttributes, mapRelationships, resolveResourceObject } from './json-api-request.ts';

/** A public action declared in the manifest's `processes`. */
type PublicApiProcess = { action?: string; method?: string; path: string; body?: Record<string, unknown> };

// Optimistic concurrency. NeoServlet refuses an update unless it carries the
// record's `updated` value as it was read, and refuses a stale one. The public
// contract expresses that with standard HTTP preconditions: reads return an
// opaque `ETag` derived from `updated`, and PUT/PATCH must send it back in
// `If-Match`. `updated` itself stays read-only in the body.
type HeaderSink = { setHeader(name: string, value: string): unknown };

const CONCURRENCY_FIELD = 'updated';
const NEO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

// Only a canonical NeoServlet timestamp becomes an ETag: any other value could
// never pass versionFromIfMatch, so the client would get a version it can
// never use and every retry would fail with 412.
export function toEtag(version: unknown): string | undefined {
  if (typeof version !== 'string' || !NEO_TIMESTAMP.test(version)) return undefined;
  return `"${Buffer.from(version, 'utf8').toString('base64url')}"`;
}

// A 412 whose body carries a stable machine-readable `code`.
function preconditionFailed(message: string, code: 'precondition_failed' | 'stale_record'): PreconditionFailedException {
  return new PreconditionFailedException({
    statusCode: HttpStatus.PRECONDITION_FAILED, error: 'Precondition Failed', code, message,
  });
}

// Returns the `updated` value an If-Match header stands for. A missing header
// is a 428; anything that is not one of our strong ETags is a 412, because it
// cannot match the current version (NeoServlet would answer a malformed value
// with a 500).
export function versionFromIfMatch(ifMatch: string | undefined): string {
  const value = ifMatch?.trim();
  if (!value || value === '*') {
    throw new HttpException(
      {
        statusCode: HttpStatus.PRECONDITION_REQUIRED,
        error: 'Precondition Required',
        code: 'precondition_required',
        message: value === '*'
          ? 'If-Match: * is not accepted. Send the ETag returned when the record was read.'
          : 'Updates require an If-Match header carrying the ETag returned when the record was read.',
      },
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }
  const match = /^"([A-Za-z0-9_-]+)"$/.exec(value);
  const version = match ? Buffer.from(match[1], 'base64url').toString('utf8') : '';
  if (!NEO_TIMESTAMP.test(version)) {
    throw preconditionFailed('If-Match does not match the current version of the record. Read it again and retry with its ETag.', 'precondition_failed');
  }
  return version;
}

/** A validated list query plus the root-relative path its pagination links are built on. */
type ListRequest = { query: ListQuery; basePath: string };

/** NeoServlet answers a record, a list or nothing: always hand back a list of records. */
function asRecords(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  return data === null || data === undefined ? [] : [data as Record<string, unknown>];
}

@Controller()
// Guard order matters: the throttler reads the key id of a request the key guard already validated.
@UseGuards(PublicApiKeyGuard, PublicApiThrottlerGuard, JsonApiNegotiationGuard)
@UseFilters(JsonApiExceptionFilter)
@UseInterceptors(JsonApiResponseInterceptor)
export class PublicApiController {
  constructor(
    @Inject(PUBLIC_API_SCHEMA) private readonly schema: PublicApiSchema,
    // @Optional(): neither param has a registered provider (they're plain
    // string/function values, not DI tokens) — without it Nest tries to
    // resolve them anyway and throws, since a JS default parameter value only
    // applies when the argument is `undefined`, not merely absent (ETP-5345).
    @Optional() private readonly neoBaseUrl: string = process.env.NEO_BASE_URL ?? 'http://localhost:8080/etendo',
    @Optional() private readonly fetchImpl: typeof fetch = fetch
  ) {}

  @Get(':entityName')
  async list(
    @Param('entityName') entityName: string,
    @Req() req: { neoJwt: string },
    @Query() query: Record<string, unknown> = {},
  ) {
    this.assertTopLevel(entityName);
    this.assertOperation(entityName, 'GET');
    return this.forward(entityName, req, 'GET', undefined, undefined, undefined, undefined, this.listRequest(entityName, `/api/v1/${entityName}`, query));
  }

  @Get(':parentName/:parentId/:childName')
  async listChild(
    @Param('parentName') parentName: string,
    @Param('parentId') parentId: string,
    @Param('childName') childName: string,
    @Req() req: { neoJwt: string },
    @Query() query: Record<string, unknown> = {},
  ) {
    const child = this.childOrThrow(parentName, childName);
    this.assertOperation(child.publicName, 'GET');
    const basePath = `/api/v1/${parentName}/${encodeURIComponent(parentId)}/${childName}`;
    return this.forward(child.publicName, req, 'GET', undefined, undefined, parentId, undefined, this.listRequest(child.publicName, basePath, query));
  }

  @Get(':parentName/:parentId/:childName/:id')
  async getChild(
    @Param('parentName') parentName: string,
    @Param('parentId') parentId: string,
    @Param('childName') childName: string,
    @Param('id') id: string,
    @Req() req: { neoJwt: string },
    @Res({ passthrough: true }) res?: HeaderSink,
  ) {
    const child = this.childOrThrow(parentName, childName);
    this.assertOperation(child.publicName, 'GET');
    return this.forward(child.publicName, req, 'GET', undefined, id, parentId, res);
  }

  @Post(':parentName/:parentId/:childName')
  async createChild(
    @Param('parentName') parentName: string,
    @Param('parentId') parentId: string,
    @Param('childName') childName: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { neoJwt: string },
    @Res({ passthrough: true }) res?: HeaderSink,
  ) {
    const child = this.childOrThrow(parentName, childName);
    this.assertOperation(child.publicName, 'POST');
    return this.forward(child.publicName, req, 'POST', { ...this.filterWritable(child.publicName, body), parentId }, undefined, parentId, res);
  }

  @Put(':parentName/:parentId/:childName/:id')
  async updateChild(
    @Param('parentName') parentName: string,
    @Param('parentId') parentId: string,
    @Param('childName') childName: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { neoJwt: string },
    @Headers('if-match') ifMatch?: string,
    @Res({ passthrough: true }) res?: HeaderSink,
  ) {
    const child = this.childOrThrow(parentName, childName);
    this.assertOperation(child.publicName, 'PUT');
    const writable = this.withVersion(child.publicName, this.filterWritable(child.publicName, body, id), ifMatch);
    return this.forward(child.publicName, req, 'PUT', writable, id, parentId, res);
  }

  @Patch(':parentName/:parentId/:childName/:id')
  async patchChild(
    @Param('parentName') parentName: string,
    @Param('parentId') parentId: string,
    @Param('childName') childName: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { neoJwt: string },
    @Headers('if-match') ifMatch?: string,
    @Res({ passthrough: true }) res?: HeaderSink,
  ) {
    const child = this.childOrThrow(parentName, childName);
    this.assertOperation(child.publicName, 'PATCH');
    const writable = this.withVersion(child.publicName, this.filterWritable(child.publicName, body, id), ifMatch);
    return this.forward(child.publicName, req, 'PATCH', writable, id, parentId, res);
  }

  @Delete(':parentName/:parentId/:childName/:id')
  @HttpCode(204)
  async removeChild(
    @Param('parentName') parentName: string,
    @Param('parentId') parentId: string,
    @Param('childName') childName: string,
    @Param('id') id: string,
    @Req() req: { neoJwt: string },
  ) {
    const child = this.childOrThrow(parentName, childName);
    this.assertOperation(child.publicName, 'DELETE');
    return this.forward(child.publicName, req, 'DELETE', undefined, id, parentId);
  }

  @Get(':entityName/:id')
  async get(
    @Param('entityName') entityName: string,
    @Param('id') id: string,
    @Req() req: { neoJwt: string },
    @Res({ passthrough: true }) res?: HeaderSink,
  ) {
    this.assertTopLevel(entityName);
    this.assertOperation(entityName, 'GET');
    return this.forward(entityName, req, 'GET', undefined, id, undefined, res);
  }

  @Post(':entityName')
  async create(
    @Param('entityName') entityName: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { neoJwt: string },
    @Res({ passthrough: true }) res?: HeaderSink,
  ) {
    this.assertTopLevel(entityName);
    this.assertOperation(entityName, 'POST');
    return this.forward(entityName, req, 'POST', this.filterWritable(entityName, body), undefined, undefined, res);
  }

  @Put(':entityName/:id')
  async update(
    @Param('entityName') entityName: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { neoJwt: string },
    @Headers('if-match') ifMatch?: string,
    @Res({ passthrough: true }) res?: HeaderSink,
  ) {
    this.assertTopLevel(entityName);
    this.assertOperation(entityName, 'PUT');
    const writable = this.withVersion(entityName, this.filterWritable(entityName, body, id), ifMatch);
    return this.forward(entityName, req, 'PUT', writable, id, undefined, res);
  }

  @Patch(':entityName/:id')
  async patch(
    @Param('entityName') entityName: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { neoJwt: string },
    @Headers('if-match') ifMatch?: string,
    @Res({ passthrough: true }) res?: HeaderSink,
  ) {
    this.assertTopLevel(entityName);
    this.assertOperation(entityName, 'PATCH');
    const writable = this.withVersion(entityName, this.filterWritable(entityName, body, id), ifMatch);
    return this.forward(entityName, req, 'PATCH', writable, id, undefined, res);
  }

  @Delete(':entityName/:id')
  @HttpCode(204)
  async remove(@Param('entityName') entityName: string, @Param('id') id: string, @Req() req: { neoJwt: string }) {
    this.assertTopLevel(entityName);
    this.assertOperation(entityName, 'DELETE');
    return this.forward(entityName, req, 'DELETE', undefined, id);
  }

  /**
   * Runs a declared business action (for example `complete`) on a top-level
   * record. The action list is the manifest's `processes`; the request body is
   * ignored in v1. Answers the record re-read after the action plus NEO's message.
   */
  @Post(':entityName/:id/actions/:action')
  @HttpCode(200)
  async runAction(
    @Param('entityName') entityName: string,
    @Param('id') id: string,
    @Param('action') action: string,
    @Req() req: { neoJwt: string },
    @Res({ passthrough: true }) res?: HeaderSink,
  ) {
    this.assertTopLevel(entityName);
    const entity = this.entityOrThrow(entityName);
    const declared = (entity as { processes?: PublicApiProcess[] }).processes?.find(
      (process) => process.action === action && process.method?.toUpperCase() === 'POST',
    );
    if (!declared) throw new NotFoundException(`Unknown action ${action} for ${entityName}`);
    this.assertRecordId(id);
    const url = `${this.neoBaseUrl}/sws/neo/${entity.specName}${declared.path.replace(':id', encodeURIComponent(id))}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${req.neoJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(declared.body ?? {}),
      });
    } catch {
      // No answer at all: the action may or may not have been applied.
      throw badGateway('Etendo did not answer the action request. Check meta.hint before retrying.', {
        hint: 'The action may have been applied. Read the record before retrying.',
      });
    }
    if (!response.ok) {
      throw upstreamException(response.status, await response.json().catch(() => null));
    }
    const answer = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const meta: Record<string, unknown> = {};
    if (typeof answer?.message === 'string') meta.message = answer.message;
    if (answer?.alreadyApplied === true) meta.alreadyApplied = true;
    // The action is already committed: a failed re-read must not turn it into an error.
    try {
      const document = (await this.forward(entityName, req, 'GET', undefined, id, undefined, res)) as Record<string, unknown>;
      return { ...document, meta: { ...(document.meta as Record<string, unknown> | undefined), ...meta } };
    } catch {
      return {
        meta: { ...meta, hint: 'The action succeeded but the record could not be read back. Read the record to see its current state.' },
      };
    }
  }

  /** Validates a list request's query before anything is sent to Etendo. */
  private listRequest(entityName: string, basePath: string, query: Record<string, unknown>): ListRequest {
    return { query: parseListQuery(this.entityOrThrow(entityName), query), basePath };
  }

  private entityOrThrow(entityName: string): PublicApiEntity & { entityName?: string } {
    const entity = this.schema.entities[entityName] as (PublicApiEntity & { entityName?: string }) | undefined;
    if (!entity) throw new NotFoundException(`Unknown public entity: ${entityName}`);
    return entity;
  }

  private childOrThrow(parentName: string, childPath: string) {
    this.entityOrThrow(parentName);
    const child = Object.values(this.schema.entities).find((candidate) => {
      const parent = (candidate as PublicApiEntity & { parent?: { resource: string; pathSegment: string } }).parent;
      return parent?.resource === parentName && parent.pathSegment === childPath;
    }) as (PublicApiEntity & { publicName: string; parent: { resource: string; pathSegment: string } }) | undefined;
    if (!child) throw new NotFoundException(`Unknown child resource: ${parentName}/${childPath}`);
    return child;
  }

  /** A path-segment id (`.`/`..` would be normalised by URL resolution into another NEO route) must be a real id. */
  private assertRecordId(id: string | undefined) {
    if (id !== undefined && (id.trim() === '' || id === '.' || id === '..')) {
      throw new NotFoundException('The record does not exist');
    }
  }

  private assertTopLevel(entityName: string) {
    const entity = this.entityOrThrow(entityName) as PublicApiEntity & { parent?: unknown };
    if (entity.parent) {
      throw new NotFoundException(`Child resource must be addressed through its master: ${entityName}`);
    }
  }

  private assertOperation(entityName: string, operation: string) {
    const entity = this.entityOrThrow(entityName);
    const allowed = entity.operations.map((value) => value.toUpperCase());
    if (!allowed.includes(operation) && !(operation === 'GET' && allowed.includes('LIST'))) {
      throw new NotFoundException(`Operation ${operation} is not exposed for ${entityName}`);
    }
  }

  /** Maps a write body (JSON:API or flat) to NeoServlet's internal field paths ([json-api-request.ts]). */
  private filterWritable(entityName: string, body: Record<string, unknown>, urlId?: string) {
    const entity = this.entityOrThrow(entityName);
    const { attributes, relationships } = resolveResourceObject(body, entityName, urlId);
    return { ...mapAttributes(entity, attributes), ...mapRelationships(entity, relationships) };
  }

  // Internal path of the field NeoServlet uses for optimistic concurrency, when
  // the resource publishes it. The gateway does not require If-Match for
  // resources without it.
  private concurrencyPath(entityName: string): string | undefined {
    return (this.entityOrThrow(entityName).fields[CONCURRENCY_FIELD] as PublicApiField | undefined)?.internalPath;
  }

  private withVersion(entityName: string, mapped: Record<string, unknown>, ifMatch: string | undefined) {
    const path = this.concurrencyPath(entityName);
    if (!path) return mapped;
    return { ...mapped, [path]: versionFromIfMatch(ifMatch) };
  }

  private etagOf(entityName: string, record: Record<string, unknown> | undefined): string | undefined {
    const path = this.concurrencyPath(entityName);
    return path && record ? toEtag(record[path]) : undefined;
  }

  private toJsonApiResource(entityName: string, record: Record<string, unknown>, id?: string) {
    const entity = this.entityOrThrow(entityName);
    const etag = this.etagOf(entityName, record);
    const filtered = filterOutboundRecord(entity, record);
    const resourceId = filtered.id ?? id;
    const attributes: Record<string, unknown> = { ...filtered };
    delete attributes.id;
    const relationships: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(entity.fields) as Array<[string, PublicApiField & { relationship?: { resource: string } }]>) {
      if (!field.relationship || !(name in attributes)) continue;
      const value = attributes[name];
      delete attributes[name];
      if (value === null || value === undefined) {
        relationships[name] = { data: null };
        continue;
      }
      const relatedId = typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>).id ?? (value as Record<string, unknown>).identifier ?? (value as Record<string, unknown>)._id
        : value;
      relationships[name] = {
        data: relatedId === undefined || relatedId === null ? null : { type: field.relationship.resource, id: String(relatedId) },
        links: relatedId === undefined || relatedId === null ? undefined : { related: `/api/v1/${field.relationship.resource}/${encodeURIComponent(String(relatedId))}` },
      };
    }
    return {
      type: entityName,
      ...(resourceId === undefined || resourceId === null ? {} : { id: String(resourceId) }),
      attributes,
      ...(Object.keys(relationships).length ? { relationships } : {}),
      ...(resourceId === undefined || resourceId === null ? {} : { links: { self: `/api/v1/${entityName}/${encodeURIComponent(String(resourceId))}` } }),
      ...(etag ? { meta: { etag } } : {}),
    };
  }

  /**
   * Builds the top-level document. A collection read is an array; any other
   * response is a single resource object, even though NeoServlet wraps a
   * single record in a one-element array.
   */
  private toJsonApi(entityName: string, data: unknown, id: string | undefined, single: boolean, method: string) {
    if (!single) return { data: asRecords(data).map((record) => this.toJsonApiResource(entityName, record)) };
    const records = asRecords(data);
    if (records.length > 1) throw badGateway('Etendo answered several records for a single-record request.');
    if (records.length === 0) {
      // An empty read is a missing record; an empty write answer says nothing about the write.
      if (method === 'GET') throw new NotFoundException('The record does not exist');
      throw badGateway('Etendo answered without the written record.');
    }
    return { data: this.toJsonApiResource(entityName, records[0], id) };
  }

  /**
   * A page of a collection with `meta.page` and `links`. NEO's `totalRows` comes
   * from a count query (we never send `_noCount`), so it is exact; it is still
   * checked for plausibility and left out when it is not. When the page asked
   * for lies past the end, the datasource rewinds and answers the FIRST page
   * (its `startRow` is then not the one requested): that is an empty page here.
   */
  private toListDocument(entityName: string, data: unknown, envelope: { startRow?: unknown; totalRows?: unknown } | undefined, list: ListRequest) {
    const { query, basePath } = list;
    let records = asRecords(data);
    const answeredStart = typeof envelope?.startRow === 'number' ? envelope.startRow : query.startRow;
    if (answeredStart !== query.startRow) records = [];
    records = records.slice(0, query.pageSize);
    const reported = envelope?.totalRows;
    const total = typeof reported === 'number' && Number.isSafeInteger(reported) && reported >= (records.length ? query.startRow + records.length : 0)
      ? reported
      : undefined;
    return {
      data: records.map((record) => this.toJsonApiResource(entityName, record)),
      ...pagination(basePath, query, records.length, total),
    };
  }

  /** The document for a successful NeoServlet answer (status already known to be 2xx). */
  private async toSuccessDocument(response: Response, entityName: string, method: string, id?: string, res?: HeaderSink, list?: ListRequest) {
    // DELETE answers 204 without a body whatever Etendo returned on success.
    if (method === 'DELETE') return undefined;
    if (response.status === 204) {
      // JSON:API: a successful update with nothing to show answers 200 with only top-level meta.
      if (method === 'PUT' || method === 'PATCH') return { meta: { status: 'updated' } };
      throw badGateway('Etendo answered without content.');
    }
    const json = (await response.json()) as { response?: { data?: unknown; startRow?: unknown; totalRows?: unknown } };
    const data = json.response && 'data' in json.response ? json.response.data : json;
    if (list && method === 'GET' && id === undefined) return this.toListDocument(entityName, data, json.response, list);
    const document = this.toJsonApi(entityName, data, id, !(method === 'GET' && id === undefined), method);
    // A single-record answer (read, create, update) carries the new version in the ETag header.
    const single = document.data;
    const etag = !Array.isArray(single) ? (single as { meta?: { etag?: string } }).meta?.etag : undefined;
    if (etag && res) res.setHeader('ETag', etag);
    return document;
  }

  private async forward(
    entityName: string,
    req: { neoJwt: string },
    method: string,
    body?: Record<string, unknown>,
    id?: string,
    parentId?: string,
    res?: HeaderSink,
    list?: ListRequest,
  ) {
    this.assertRecordId(id);
    const entity = this.entityOrThrow(entityName);
    const internalEntityName = entity.entityName ?? entityName;
    const params = [...(parentId ? [`parentId=${encodeURIComponent(parentId)}`] : []), ...(list ? neoListParams(list.query) : [])];
    const query = params.length ? `?${params.join('&')}` : '';
    const path = `${this.neoBaseUrl}/sws/neo/${entity.specName}/${internalEntityName}${id ? `/${encodeURIComponent(id)}` : ''}${query}`;
    const response = await this.fetchImpl(path, {
      method,
      headers: {
        Authorization: `Bearer ${req.neoJwt}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const upstream = await response.json().catch(() => null);
      // NeoServlet refuses a write whose `updated` is no longer current with
      // 409 `stale_record`: for a versioned resource that is a failed If-Match (412).
      // Any other 409 keeps its status (standard conflict), as does a stale_record
      // on a resource that publishes no `updated` (no If-Match applies to it).
      if (response.status === 409 && parseUpstreamError(upstream).code === 'stale_record' && this.concurrencyPath(entityName)) {
        const conflict = upstreamException(409, upstream).getResponse() as { errors: JsonApiError[] };
        throw new HttpException(
          { errors: conflict.errors.map((error) => ({ ...error, status: '412', title: 'Precondition Failed' })) },
          HttpStatus.PRECONDITION_FAILED,
        );
      }
      throw upstreamException(response.status, upstream);
    }
    return this.toSuccessDocument(response, entityName, method, id, res, list);
  }
}
