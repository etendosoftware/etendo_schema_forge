import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Put,
  Req,
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
  upstreamException,
} from './json-api-http.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
  ) {
    const child = this.childOrThrow(parentName, childName);
    this.assertOperation(child.publicName, 'GET');
    return this.forward(child.publicName, req, 'GET', undefined, id, parentId);
  }

  @Post(':parentName/:parentId/:childName')
  async createChild(
    @Param('parentName') parentName: string,
    @Param('parentId') parentId: string,
    @Param('childName') childName: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { neoJwt: string },
  ) {
    const child = this.childOrThrow(parentName, childName);
    this.assertOperation(child.publicName, 'POST');
    return this.forward(child.publicName, req, 'POST', { ...this.filterWritable(child.publicName, body), parentId }, undefined, parentId);
  }

  @Put(':parentName/:parentId/:childName/:id')
  async updateChild(
    @Param('parentName') parentName: string,
    @Param('parentId') parentId: string,
    @Param('childName') childName: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { neoJwt: string },
  ) {
    const child = this.childOrThrow(parentName, childName);
    this.assertOperation(child.publicName, 'PUT');
    return this.forward(child.publicName, req, 'PUT', this.filterWritable(child.publicName, body, id), id, parentId);
  }

  @Patch(':parentName/:parentId/:childName/:id')
  async patchChild(
    @Param('parentName') parentName: string,
    @Param('parentId') parentId: string,
    @Param('childName') childName: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: { neoJwt: string },
  ) {
    const child = this.childOrThrow(parentName, childName);
    this.assertOperation(child.publicName, 'PATCH');
    return this.forward(child.publicName, req, 'PATCH', this.filterWritable(child.publicName, body, id), id, parentId);
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
  async get(@Param('entityName') entityName: string, @Param('id') id: string, @Req() req: { neoJwt: string }) {
    this.assertTopLevel(entityName);
    this.assertOperation(entityName, 'GET');
    return this.forward(entityName, req, 'GET', undefined, id);
  }

  @Post(':entityName')
  async create(@Param('entityName') entityName: string, @Body() body: Record<string, unknown>, @Req() req: { neoJwt: string }) {
    this.assertTopLevel(entityName);
    this.assertOperation(entityName, 'POST');
    return this.forward(entityName, req, 'POST', this.filterWritable(entityName, body));
  }

  @Put(':entityName/:id')
  async update(@Param('entityName') entityName: string, @Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: { neoJwt: string }) {
    this.assertTopLevel(entityName);
    this.assertOperation(entityName, 'PUT');
    return this.forward(entityName, req, 'PUT', this.filterWritable(entityName, body, id), id);
  }

  @Patch(':entityName/:id')
  async patch(@Param('entityName') entityName: string, @Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: { neoJwt: string }) {
    this.assertTopLevel(entityName);
    this.assertOperation(entityName, 'PATCH');
    return this.forward(entityName, req, 'PATCH', this.filterWritable(entityName, body, id), id);
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

  /**
   * Maps a write body to NeoServlet's internal field paths. A body is either
   * JSON:API (`{ data: { type?, id?, attributes?, relationships? } }`, where
   * `attributes` and `relationships` are both optional) or flat
   * (`{ field: value }`). `type` and `id` are resource members, never
   * attributes; when they disagree with the URL the answer is 409, as
   * JSON:API prescribes.
   */
  private filterWritable(entityName: string, body: Record<string, unknown>, urlId?: string) {
    const entity = this.entityOrThrow(entityName);
    if (!isRecord(body)) throw new BadRequestException('The request body must be a JSON object');
    let input: Record<string, unknown> = body;
    if ('data' in body) {
      if (!isRecord(body.data)) throw new BadRequestException('"data" must be a single resource object');
      input = body.data;
      if (input.type !== undefined && input.type !== entityName) {
        throw new ConflictException(`Resource type "${String(input.type)}" does not match "${entityName}"`);
      }
      if (urlId !== undefined && input.id !== undefined && String(input.id) !== urlId) {
        throw new ConflictException(`Resource id "${String(input.id)}" does not match the id in the URL`);
      }
    }
    const jsonApiResource = 'data' in body || 'attributes' in input || 'relationships' in input;
    const attributes = jsonApiResource ? input.attributes ?? {} : input;
    const relationships = jsonApiResource ? input.relationships ?? {} : {};
    if (!isRecord(attributes)) throw new BadRequestException('"attributes" must be an object');
    if (!isRecord(relationships)) throw new BadRequestException('"relationships" must be an object');
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attributes)) {
      const field = entity.fields[key] as (PublicApiField & { direction?: string; relationship?: unknown }) | undefined;
      if (!field || !['in', 'inout'].includes(field.direction ?? '')) {
        throw new BadRequestException(`Field "${key}" is not writable by the public API`);
      }
      // A foreign key lives under `relationships`; accepting it here would let
      // the same link be written (and read back) in two places.
      if (field.relationship) {
        throw new BadRequestException(`"${key}" is a relationship: send it under "relationships" as { "data": { "type": "...", "id": "..." } }`);
      }
      mapped[field.internalPath] = value;
    }
    for (const [key, relationship] of Object.entries(relationships)) {
      const field = entity.fields[key] as (PublicApiField & { direction?: string; relationship?: { resource: string } }) | undefined;
      if (!field?.relationship || !['in', 'inout'].includes(field.direction ?? '')) {
        throw new BadRequestException(`Relationship "${key}" is not writable by the public API`);
      }
      mapped[field.internalPath] = this.relationshipId(key, relationship, field.relationship.resource);
    }
    return mapped;
  }

  /** Reads the `{ type, id }` linkage of a to-one relationship; `{ data: null }` clears it. */
  private relationshipId(name: string, relationship: unknown, resource: string): string | null {
    if (!isRecord(relationship) || !('data' in relationship)) {
      throw new BadRequestException(`Relationship "${name}" must carry a "data" member: { "data": { "type": "${resource}", "id": "..." } } or { "data": null }`);
    }
    const linkage = relationship.data;
    if (linkage === null) return null;
    if (!isRecord(linkage) || typeof linkage.id !== 'string' || !linkage.id) {
      throw new BadRequestException(`Relationship "${name}" data must be a single resource identifier with a string "id" (to-many relationships are not supported)`);
    }
    if (linkage.type !== resource) {
      throw new ConflictException(`Relationship "${name}" expects type "${resource}", got "${String(linkage.type)}"`);
    }
    return linkage.id;
  }

  private toJsonApiResource(entityName: string, record: Record<string, unknown>, id?: string) {
    const entity = this.entityOrThrow(entityName);
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
    };
  }

  /**
   * Builds the top-level document. A collection read is an array; any other
   * response is a single resource object, even though NeoServlet wraps a
   * single record in a one-element array.
   */
  private toJsonApi(entityName: string, data: unknown, id: string | undefined, single: boolean) {
    if (!single) {
      const records = Array.isArray(data) ? data : data === null || data === undefined ? [] : [data];
      return { data: records.map((record) => this.toJsonApiResource(entityName, record as Record<string, unknown>)) };
    }
    let record = data;
    if (Array.isArray(data)) {
      if (data.length > 1) throw new BadGatewayException({ errors: [{ status: '502', title: 'Bad Gateway', detail: 'Etendo answered several records for a single-record request.' }] });
      record = data[0];
    }
    if (record === null || record === undefined) throw new NotFoundException('The record does not exist');
    return { data: this.toJsonApiResource(entityName, record as Record<string, unknown>, id) };
  }

  private async forward(
    entityName: string,
    req: { neoJwt: string },
    method: string,
    body?: Record<string, unknown>,
    id?: string,
    parentId?: string,
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
      throw upstreamException(response.status, await response.json().catch(() => null));
    }
    // DELETE answers 204 without a body whatever Etendo returned on success.
    if (method === 'DELETE') return undefined;
    if (response.status === 204) {
      // JSON:API: a successful update with nothing to show answers 200 with only top-level meta.
      if (method === 'PUT' || method === 'PATCH') return { meta: { status: 'updated' } };
      throw new BadGatewayException({ errors: [{ status: '502', title: 'Bad Gateway', detail: 'Etendo answered without content.' }] });
    }
    const json = (await response.json()) as { response?: { data?: unknown } };
    const data = json.response && 'data' in json.response ? json.response.data : json;
    return this.toJsonApi(entityName, data, id, !(method === 'GET' && id === undefined));
  }
}
