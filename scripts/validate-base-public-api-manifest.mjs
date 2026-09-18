import { readFile } from 'node:fs/promises';

const manifestPath = process.argv[2] ?? 'public-api/base.v1.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const entities = manifest.entities ?? {};
const errors = [];

for (const [resource, entity] of Object.entries(entities)) {
  if (!entity.publicApi) errors.push(`${resource}: publicApi must be true`);
  if (entity.fields?.id?.internalPath !== 'id') {
    errors.push(`${resource}: public id must map to NeoServlet field id`);
  }
  if (/accounting/i.test(resource) || /accounting/i.test(entity.functional?.functionalName ?? '')) {
    errors.push(`${resource}: excluded accounting resource is present`);
  }

  if (!entity.parent) continue;
  const parent = entities[entity.parent.resource];
  if (!parent) errors.push(`${resource}: parent resource ${entity.parent.resource} is missing`);
  if (!entity.parent.foreignKey) errors.push(`${resource}: parent foreignKey is missing`);
  if (!entity.parent.pathSegment) errors.push(`${resource}: parent pathSegment is missing`);

  const required = ['GET', 'LIST', 'POST', 'PUT', 'PATCH', 'DELETE'];
  for (const operation of required) {
    if (!entity.operations.includes(operation)) {
      errors.push(`${resource}: child is missing ${operation}`);
    }
  }
}

const relationships = [];
for (const [resource, entity] of Object.entries(entities)) {
  for (const [field, value] of Object.entries(entity.fields ?? {})) {
    if (!value.relationship) continue;
    relationships.push(`${resource}.${field}`);
    if (!entities[value.relationship.resource]) {
      errors.push(`${resource}.${field}: relationship target ${value.relationship.resource} is missing`);
    }
    if (!['one', 'many'].includes(value.relationship.cardinality)) {
      errors.push(`${resource}.${field}: invalid cardinality`);
    }
    if (!value.relationship.foreignKey) errors.push(`${resource}.${field}: relationship foreignKey is missing`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  const children = Object.values(entities).filter((entity) => entity.parent).length;
  console.log(`Validated ${Object.keys(entities).length} resources, ${children} child resources, ${relationships.length} relationships`);
}
