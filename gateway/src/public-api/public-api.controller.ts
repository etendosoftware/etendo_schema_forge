import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  PUBLIC_API_SCHEMA,
  PublicApiKeyGuard,
  type PublicApiEntity,
  type PublicApiField,
  filterOutboundRecord,
  type PublicApiSchema,
} from '@etendosoftware/api-gateway-core';

// Optimistic concurrency. NeoServlet refuses an update unless it carries the
// record's `updated` value as it was read, and refuses a stale one. The public
// contract expresses that with standard HTTP preconditions: reads return an
// opaque `ETag` derived from `updated`, and PUT/PATCH must send it back in
// `If-Match`. `updated` itself stays read-only in the body.
type HeaderSink = { setHeader(name: string, value: string): unknown };

const CONCURRENCY_FIELD = 'updated';
const NEO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

export function toEtag(version: unknown): string | undefined {
  if (version === null || version === undefined || version === '') return undefined;
  return `"${Buffer.from(String(version), 'utf8').toString('base64url')}"`;
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
        message: 'Updates require an If-Match header carrying the ETag returned when the record was read.',
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

@Controller()
@UseGuards(PublicApiKeyGuard)
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
    const writable = this.withVersion(child.publicName, this.filterWritable(child.publicName, body), ifMatch);
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
    const writable = this.withVersion(child.publicName, this.filterWritable(child.publicName, body), ifMatch);
    return this.forward(child.publicName, req, 'PATCH', writable, id, parentId, res);
  }

  @Delete(':parentName/:parentId/:childName/:id')
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
    const writable = this.withVersion(entityName, this.filterWritable(entityName, body), ifMatch);
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
    const writable = this.withVersion(entityName, this.filterWritable(entityName, body), ifMatch);
    return this.forward(entityName, req, 'PATCH', writable, id, undefined, res);
  }

  @Delete(':entityName/:id')
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

  private filterWritable(entityName: string, body: Record<string, unknown>) {
    const entity = this.entityOrThrow(entityName);
    const input = body.data && typeof body.data === 'object'
      ? body.data as { attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id?: string } | null }> }
      : body;
    const attributes = 'attributes' in input ? (input.attributes ?? {}) : input as Record<string, unknown>;
    const relationships = 'relationships' in input ? (input.relationships ?? {}) : {};
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attributes)) {
      const field = entity.fields[key] as (PublicApiField & { direction?: string }) | undefined;
      if (!field || !['in', 'inout'].includes(field.direction ?? '')) {
        throw new BadRequestException(`Field "${key}" is not writable by the public API`);
      }
      mapped[field.internalPath] = value;
    }
    for (const [key, relationship] of Object.entries(relationships)) {
      const field = entity.fields[key] as (PublicApiField & { direction?: string; relationship?: { resource: string } }) | undefined;
      if (!field?.relationship || !['in', 'inout'].includes(field.direction ?? '')) {
        throw new BadRequestException(`Relationship "${key}" is not writable by the public API`);
      }
      mapped[field.internalPath] = relationship.data?.id ?? null;
    }
    return mapped;
  }

  // Internal path of the field NeoServlet uses for optimistic concurrency, when
  // the resource publishes it. Resources without it are not version-checked.
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

  private toJsonApi(entityName: string, data: unknown, id?: string) {
    if (Array.isArray(data)) return { data: data.map((record) => this.toJsonApiResource(entityName, record as Record<string, unknown>)) };
    return { data: this.toJsonApiResource(entityName, data as Record<string, unknown>, id) };
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
      const errorBody = (await response.json().catch(() => null)) as
        { error?: string | { message?: string }; message?: string } | null;
      // NeoServlet refuses a write whose `updated` is no longer current with
      // 409 `stale_record`: for the public API that is a failed If-Match.
      if (response.status === 409 && errorBody?.error === 'stale_record') {
        throw new PreconditionFailedException(
          errorBody.message ?? 'The record was modified after it was read. Read it again and retry with its ETag.',
        );
      }
      const message = (typeof errorBody?.error === 'object' ? errorBody.error.message : undefined)
        ?? `NeoServlet request failed with status ${response.status}`;
      if (response.status === 400 || response.status === 409) throw new BadRequestException(message);
      if (response.status === 401 || response.status === 403) throw new UnauthorizedException(message);
      throw new BadGatewayException(message);
    }
    if (response.status === 204) return null;
    const json = (await response.json()) as { response?: { data?: unknown } };
    const data = json.response?.data ?? json;
    // A single-record answer (read, create, update) carries the new version in
    // the ETag header; NeoServlet wraps it in a one-element array.
    const single = Array.isArray(data) ? (data.length === 1 && (id || method !== 'GET') ? data[0] : undefined) : data;
    const etag = this.etagOf(entityName, single as Record<string, unknown> | undefined);
    if (etag && res) res.setHeader('ETag', etag);
    return this.toJsonApi(entityName, data, id);
  }
}
