import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PublicApiEntity, PublicApiField } from '@etendosoftware/api-gateway-core';
import { isRecord } from './json-api-http.ts';

// Reads a write body (JSON:API or flat) into NeoServlet's internal field
// paths. `type` and `id` are resource members, never attributes; when they
// disagree with the URL the answer is 409, as JSON:API prescribes.

type WritableField = PublicApiField & { direction?: string; relationship?: { resource: string } };

export const isWritable = (field: WritableField | undefined): field is WritableField =>
  Boolean(field) && ['in', 'inout'].includes(field?.direction ?? '');

/** The `attributes` and `relationships` a body carries; both are optional in a JSON:API body. */
export function resolveResourceObject(
  body: unknown,
  entityName: string,
  urlId: string | undefined,
): { attributes: unknown; relationships: unknown } {
  if (!isRecord(body)) throw new BadRequestException('The request body must be a JSON object');
  if (!('data' in body)) {
    // Flat body: attributes only, unless it spells out a JSON:API resource without `data`.
    return 'attributes' in body || 'relationships' in body
      ? { attributes: body.attributes ?? {}, relationships: body.relationships ?? {} }
      : { attributes: body, relationships: {} };
  }
  const resource = body.data;
  if (!isRecord(resource)) throw new BadRequestException('"data" must be a single resource object');
  if (resource.type !== undefined && resource.type !== entityName) {
    throw new ConflictException(`Resource type "${String(resource.type)}" does not match "${entityName}"`);
  }
  if (urlId !== undefined && resource.id !== undefined && String(resource.id) !== urlId) {
    throw new ConflictException(`Resource id "${String(resource.id)}" does not match the id in the URL`);
  }
  return { attributes: resource.attributes ?? {}, relationships: resource.relationships ?? {} };
}

/** Maps attributes to internal paths; a foreign key is refused here, it lives under `relationships`. */
export function mapAttributes(entity: PublicApiEntity, attributes: unknown): Record<string, unknown> {
  if (!isRecord(attributes)) throw new BadRequestException('"attributes" must be an object');
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    const field = entity.fields[key] as WritableField | undefined;
    if (!isWritable(field)) throw new BadRequestException(`Field "${key}" is not writable by the public API`);
    // Accepting a foreign key here would let the same link be written (and read back) in two places.
    if (field.relationship) {
      throw new BadRequestException(`"${key}" is a relationship: send it under "relationships" as { "data": { "type": "...", "id": "..." } }`);
    }
    mapped[field.internalPath] = value;
  }
  return mapped;
}

/** Maps to-one relationships to internal paths; `{ data: null }` clears one. */
export function mapRelationships(entity: PublicApiEntity, relationships: unknown): Record<string, unknown> {
  if (!isRecord(relationships)) throw new BadRequestException('"relationships" must be an object');
  const mapped: Record<string, unknown> = {};
  for (const [key, relationship] of Object.entries(relationships)) {
    const field = entity.fields[key] as WritableField | undefined;
    if (!isWritable(field) || !field.relationship) {
      throw new BadRequestException(`Relationship "${key}" is not writable by the public API`);
    }
    mapped[field.internalPath] = relationshipId(key, relationship, field.relationship.resource);
  }
  return mapped;
}

/** Reads the `{ type, id }` linkage of a to-one relationship. */
export function relationshipId(name: string, relationship: unknown, resource: string): string | null {
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
