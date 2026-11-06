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

  // A child is either read-only (GET, LIST) or fully writable through its master.
  const writes = ['POST', 'PUT', 'PATCH', 'DELETE'];
  const writable = writes.some((operation) => entity.operations.includes(operation));
  const required = ['GET', 'LIST', ...(writable ? writes : [])];
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

// Lookups (GET /api/v1/<resource>/lookups/<field>): top-level resources only, on a reference
// field, with a selector, a JSON:API type and a fixed context of string values.
let lookups = 0;
for (const [resource, entity] of Object.entries(entities)) {
  if (entity.parent?.pathSegment === 'lookups') {
    // Hygiene: the lookup route only shadows a child list whose parent id is literally `lookups`.
    errors.push(`${resource}: child pathSegment "lookups" is kept for lookups`);
  }
  for (const [field, value] of Object.entries(entity.fields ?? {})) {
    if (value.lookup === undefined) continue;
    lookups += 1;
    const where = `${resource}.${field}: lookup`;
    const lookup = value.lookup;
    if (typeof lookup !== 'object' || lookup === null || Array.isArray(lookup)) {
      errors.push(`${where} must be an object`);
      continue;
    }
    if (entity.parent) errors.push(`${where} is not supported on a child resource`);
    if (!value.reference) errors.push(`${where} needs a reference field`);
    if (typeof lookup.selector !== 'string' || !lookup.selector) errors.push(`${where} selector is missing`);
    if (typeof lookup.type !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(lookup.type)) errors.push(`${where} type must be kebab-case`);
    const context = lookup.context;
    if (typeof context !== 'object' || context === null || Array.isArray(context)
      || Object.values(context).some((item) => typeof item !== 'string')) {
      errors.push(`${where} context must be an object of string values`);
    } else {
      // q, limit and offset are filled by the gateway (search and page); a context key must not clash with them.
      for (const name of Object.keys(context).filter((key) => ['q', 'limit', 'offset'].includes(key))) {
        errors.push(`${where} context cannot use reserved parameter "${name}"`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  const children = Object.values(entities).filter((entity) => entity.parent).length;
  console.log(`Validated ${Object.keys(entities).length} resources, ${children} child resources, ${relationships.length} relationships, ${lookups} lookups`);
}
