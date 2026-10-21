import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  PreconditionFailedException,
  Put,
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

import {
  JsonApiExceptionFilter,
  JsonApiNegotiationGuard,
  JsonApiResponseInterceptor,
  badGateway,
  parseUpstreamError,
  upstreamException,
  type JsonApiError,
} from './json-api-http.ts';
import { mapAttributes, mapRelationships, resolveResourceObject } from './json-api-request.ts';

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
    throw new PreconditionFailedException('If-Match does not match the current version of the record. Read it again and retry with its ETag.');
  }
  return version;
}

/** NeoServlet answers a record, a list or nothing: always hand back a list of records. */
function asRecords(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  return data === null || data === undefined ? [] : [data as Record<string, unknown>];
}

@Controller()
@UseGuards(PublicApiKeyGuard, JsonApiNegotiationGuard)
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
  async list(@Param('entityName') entityName: string, @Req() req: { neoJwt: string }) {
    this.assertTopLevel(entityName);
    this.assertOperation(entityName, 'GET');
    return this.forward(entityName, req, 'GET');
  }

  @Get(':parentName/:parentId/:childName')
  async listChild(
    @Param('parentName') parentName: string,
    @Param('parentId') parentId: string,
    @Param('childName') childName: string,
    @Req() req: { neoJwt: string },
  ) {
    const child = this.childOrThrow(parentName, childName);
    this.assertOperation(child.publicName, 'GET');
    return this.forward(child.publicName, req, 'GET', undefined, undefined, parentId);
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

  /** The document for a successful NeoServlet answer (status already known to be 2xx). */
  private async toSuccessDocument(response: Response, entityName: string, method: string, id?: string, res?: HeaderSink) {
    // DELETE answers 204 without a body whatever Etendo returned on success.
    if (method === 'DELETE') return undefined;
    if (response.status === 204) {
      // JSON:API: a successful update with nothing to show answers 200 with only top-level meta.
      if (method === 'PUT' || method === 'PATCH') return { meta: { status: 'updated' } };
      throw badGateway('Etendo answered without content.');
    }
    const json = (await response.json()) as { response?: { data?: unknown } };
    const data = json.response && 'data' in json.response ? json.response.data : json;
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
  ) {
    const entity = this.entityOrThrow(entityName);
    const internalEntityName = entity.entityName ?? entityName;
    const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
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
    return this.toSuccessDocument(response, entityName, method, id, res);
  }
}
