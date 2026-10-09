/**
 * Synthesize a JSON Schema for SimpleOcrTool from an OCR doc type config.
 *
 * Sources:
 *   - `headerFields` / `lineColumns` (declared for the review modal): each
 *     entry's `extractFrom` becomes a property of the corresponding object.
 *   - `extraHeaderFields` / `extraLineFields` (optional): fields the
 *     descriptor needs but the review modal does not surface. Shape:
 *       { name: 'tax_rate', kind: 'number', description: '...' }
 *
 * Output targets OpenAI Responses API strict-schema mode:
 *   - `additionalProperties: false` on every object
 *   - every property listed in `required`
 *   - nullable values via `{ type: [<base>, 'null'] }`
 */

const KIND_TO_JSON_TYPE = {
  text: 'string',
  date: 'string',
  number: 'number',
  entity: 'string',
};

function fieldSchema(field) {
  // ETP-5585 — a nested object field: `kind: 'object'` with `properties` (same field shape).
  // Nullable as a whole, strict inside (every property required + nullable).
  if (field.kind === 'object' && Array.isArray(field.properties)) {
    const nested = buildObjectSchema(field.properties);
    const schema = { ...nested, type: ['object', 'null'] };
    if (field.description) schema.description = field.description;
    return schema;
  }
  const baseType = KIND_TO_JSON_TYPE[field.kind] || 'string';
  const schema = { type: [baseType, 'null'] };
  if (field.description) schema.description = field.description;
  // `enum` values stay nullable too, as strict mode needs `null` listed in the enum itself.
  if (Array.isArray(field.enum)) schema.enum = [...field.enum, null];
  return schema;
}

function propertyNamesFor(field) {
  // Modal-side fields use `extractFrom` (string or array of alternates).
  // Descriptor-only extras use `name`.
  if (Array.isArray(field.extractFrom)) return field.extractFrom.filter(Boolean);
  if (typeof field.extractFrom === 'string' && field.extractFrom) return [field.extractFrom];
  if (typeof field.name === 'string' && field.name) return [field.name];
  return [];
}

function buildObjectSchema(fields, { title = null } = {}) {
  const properties = {};
  const required = [];

  for (const field of fields) {
    for (const propName of propertyNamesFor(field)) {
      if (properties[propName]) continue;
      properties[propName] = fieldSchema(field);
      required.push(propName);
    }
  }

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  };
  if (title) schema.title = title;
  return schema;
}

export function buildOcrSchema(docType) {
  if (!docType) return null;

  const headerFields = Array.isArray(docType.headerFields) ? docType.headerFields : [];
  const extraHeader = Array.isArray(docType.extraHeaderFields) ? docType.extraHeaderFields : [];
  const lineColumns = Array.isArray(docType.lineColumns) ? docType.lineColumns : [];
  const extraLine = Array.isArray(docType.extraLineFields) ? docType.extraLineFields : [];

  const root = buildObjectSchema([...headerFields, ...extraHeader]);

  if (lineColumns.length > 0 || extraLine.length > 0) {
    root.properties.line_items = {
      type: 'array',
      description: 'Line items, in the order they appear on the document. Empty array if none.',
      items: buildObjectSchema([...lineColumns, ...extraLine], { title: 'LineItem' }),
    };
    root.required.push('line_items');
  }

  return root;
}
