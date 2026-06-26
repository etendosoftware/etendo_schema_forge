import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = process.env.SF_ROOT || join(__dirname, '..', '..');
const CLI_DIR = join(__dirname, '..', '..');

// Valid enum values per TDD 3.3
const VALID_VISIBILITY = ['editable', 'readOnly', 'system', 'discarded'];
const VALID_TYPES = [
  'string', 'integer', 'decimal', 'boolean', 'date', 'dateTime',
  'id', 'foreignKey', 'enum', 'text', 'binary', 'image', 'button',
  'amount', 'quantity', 'price', 'number', 'productAttribute',
];
const VALID_LEVELS = ['header', 'line', 'subline'];
const VALID_CATEGORIES = [
  'sales', 'purchasing', 'inventory', 'finance', 'accounting',
  'general', 'manufacturing', 'project', 'service', 'hr', 'master',
];
const VALID_SYSTEM_CATEGORIES = ['internal', 'audit', 'accounting', 'sequence'];
const SEARCHABLE_TYPES = ['string', 'enum', 'foreignKey', 'date', 'dateTime'];

/**
 * Load system-columns.json from core-maps directory.
 */
let _systemColumnsCache = null;
async function loadSystemColumns() {
  if (_systemColumnsCache) return _systemColumnsCache;
  const raw = await readFile(join(CLI_DIR, 'core-maps', 'system-columns.json'), 'utf-8');
  _systemColumnsCache = JSON.parse(raw);
  return _systemColumnsCache;
}

/**
 * Create an error/warning entry.
 */
function issue(level, code, message, path, severity = 'error') {
  return { level, code, message, path, severity };
}

function validateLevel1Fields(entity, errors, ePath) {
  // Duplicate field names
  const fieldNames = entity.fields.map(f => f.name);
  const seenFields = new Set();
  for (const name of fieldNames) {
    if (seenFields.has(name)) {
      errors.push(issue(1, 'DUPLICATE_FIELD', `Duplicate field name: ${name}`, `${ePath}.fields.${name}`));
    }
    seenFields.add(name);
  }

  for (const field of entity.fields) {
    const fPath = `${ePath}.fields.${field.name}`;

    // Valid visibility
    if (field.visibility && !VALID_VISIBILITY.includes(field.visibility)) {
      errors.push(issue(1, 'INVALID_ENUM', `Invalid visibility: ${field.visibility}`, `${fPath}.visibility`));
    }

    // Valid type
    if (field.type && !VALID_TYPES.includes(field.type)) {
      errors.push(issue(1, 'INVALID_ENUM', `Invalid field type: ${field.type}`, `${fPath}.type`));
    }
  }
}

function validateLevel1Entities(schema, errors) {
  // Duplicate entity names
  const entityNames = schema.entities.map(e => e.name);
  const seenEntities = new Set();
  for (const name of entityNames) {
    if (seenEntities.has(name)) {
      errors.push(issue(1, 'DUPLICATE_ENTITY', `Duplicate entity name: ${name}`, `entities.${name}`));
    }
    seenEntities.add(name);
  }

  for (const entity of schema.entities) {
    const ePath = `entities.${entity.name}`;

    // Valid level
    if (entity.level && !VALID_LEVELS.includes(entity.level)) {
      errors.push(issue(1, 'INVALID_ENUM', `Invalid entity level: ${entity.level}`, `${ePath}.level`));
    }

    // Field validation
    if (Array.isArray(entity.fields)) {
      validateLevel1Fields(entity, errors, ePath);
    }
  }
}

/**
 * Check top-level required fields and window structure for Level 1.
 */
function checkL1TopLevel(schema, errors) {
  if (!schema.version) {
    errors.push(issue(1, 'MISSING_FIELD', 'Missing required field: version', 'version'));
  }
  if (!schema.window) {
    errors.push(issue(1, 'MISSING_FIELD', 'Missing required field: window', 'window'));
  }
  if (!schema.entities || !Array.isArray(schema.entities)) {
    errors.push(issue(1, 'MISSING_FIELD', 'Missing required field: entities', 'entities'));
  }

  if (schema.window) {
    const requiredWindowFields = ['id', 'name', 'primaryEntity', 'category'];
    for (const field of requiredWindowFields) {
      if (schema.window[field] === undefined || schema.window[field] === null) {
        errors.push(issue(1, 'MISSING_FIELD', `Missing required field: window.${field}`, `window.${field}`));
      }
    }
    if (schema.window.category && !VALID_CATEGORIES.includes(schema.window.category)) {
      errors.push(issue(1, 'INVALID_ENUM', `Invalid window category: ${schema.window.category}`, 'window.category'));
    }
  }
}

/**
 * Validate fields within a single entity for Level 1 (duplicate names, enum values).
 */
function checkL1EntityFields(entity, ePath, errors) {
  if (!Array.isArray(entity.fields)) return;

  const seenFields = new Set();
  for (const name of entity.fields.map(f => f.name)) {
    if (seenFields.has(name)) {
      errors.push(issue(1, 'DUPLICATE_FIELD', `Duplicate field name: ${name}`, `${ePath}.fields.${name}`));
    }
    seenFields.add(name);
  }

  for (const field of entity.fields) {
    const fPath = `${ePath}.fields.${field.name}`;
    if (field.visibility && !VALID_VISIBILITY.includes(field.visibility)) {
      errors.push(issue(1, 'INVALID_ENUM', `Invalid visibility: ${field.visibility}`, `${fPath}.visibility`));
    }
    if (field.type && !VALID_TYPES.includes(field.type)) {
      errors.push(issue(1, 'INVALID_ENUM', `Invalid field type: ${field.type}`, `${fPath}.type`));
    }
  }
}

/**
 * Level 1 - Structural validation.
 * Checks required fields, valid enums, duplicate names.
 */
function validateLevel1(schema) {
  const errors = [];
  const warnings = [];

  checkL1TopLevel(schema, errors);

  if (Array.isArray(schema.entities)) {
    validateLevel1Entities(schema, errors);
  }

  return { errors, warnings };
}

/**
 * Validate entity-level cross-references for Level 2.
 */
function checkL2Entity(entity, entityNames, errors) {
  const ePath = `entities.${entity.name}`;

  if (entity.parentEntity && !entityNames.has(entity.parentEntity)) {
    errors.push(issue(2, 'INVALID_REF', `parentEntity references nonexistent entity: ${entity.parentEntity}`, `${ePath}.parentEntity`));
  }
  if (entity.parentEntity && !entity.parentField) {
    errors.push(issue(2, 'MISSING_PARENT_FIELD', `parentField must be present when parentEntity is set`, `${ePath}.parentField`));
  }

  if (!Array.isArray(entity.fields)) return;

  const fieldNames = new Set(entity.fields.map(f => f.name));
  for (const field of entity.fields) {
    const fPath = `${ePath}.fields.${field.name}`;
    const isUIVisible = field.visibility !== 'system' && field.visibility !== 'discarded';
    if (field.type === 'foreignKey' && !field.reference && isUIVisible) {
      errors.push(issue(2, 'FK_MISSING_REF', `Foreign key field '${field.name}' missing reference object`, `${fPath}.reference`));
    }
    if (field.cascadeFrom && !fieldNames.has(field.cascadeFrom)) {
      errors.push(issue(2, 'INVALID_CASCADE', `cascadeFrom references nonexistent field: ${field.cascadeFrom}`, `${fPath}.cascadeFrom`));
    }
  }
}

/**
 * Level 2 - Semantic validation.
 * Cross-references between window and entities.
 */
function validateLevel2(schema) {
  const errors = [];
  const warnings = [];

  const entityNames = new Set(schema.entities.map(e => e.name));

  if (schema.window.primaryEntity && !entityNames.has(schema.window.primaryEntity)) {
    errors.push(issue(2, 'INVALID_REF', `primaryEntity references nonexistent entity: ${schema.window.primaryEntity}`, 'window.primaryEntity'));
  }

  for (const entity of schema.entities) {
    checkL2Entity(entity, entityNames, errors);
  }

  return { errors, warnings };
}

/**
 * Validate a single system field for Level 3 rules.
 */
function checkL3SystemField(field, fPath, entity, systemColumnNames, errors, warnings) {
  if (!field.derivation && !systemColumnNames.has(field.column)) {
    warnings.push(issue(3, 'SYSTEM_NO_DERIVATION', `System field '${field.name}' has no derivation and is not in system-columns.json`, fPath, 'warning'));
  }
  if (field.systemCategory && !VALID_SYSTEM_CATEGORIES.includes(field.systemCategory)) {
    errors.push(issue(3, 'INVALID_SYSTEM_CATEGORY', `Invalid systemCategory: ${field.systemCategory}`, `${fPath}.systemCategory`));
  }
  for (const prop of ['searchable', 'grid', 'form']) {
    if (field[prop] === true) {
      errors.push(issue(3, 'SYSTEM_UI_PROP', `System field '${field.name}' must not have ${prop}=true`, `${fPath}.${prop}`));
    }
  }
  const isHeader = entity.level === 'header';
  if (field.derivation && field.derivation.type === 'fromParent' && isHeader && !entity.parentEntity) {
    errors.push(issue(3, 'INVALID_FROM_PARENT', `fromParent derivation not allowed on header entity without parent`, `${fPath}.derivation`));
  }
}

/**
 * Level 3 - Visibility validation.
 * System field rules and UI property constraints.
 */
function validateLevel3(schema, systemColumns) {
  const errors = [];
  const warnings = [];

  const systemColumnNames = new Set(Object.keys(systemColumns));

  for (const entity of schema.entities) {
    const ePath = `entities.${entity.name}`;

    if (!Array.isArray(entity.fields)) continue;

    for (const field of entity.fields) {
      if (field.visibility !== 'system') continue;
      const fPath = `${ePath}.fields.${field.name}`;
      checkL3SystemField(field, fPath, entity, systemColumnNames, errors, warnings);
    }
  }

  return { errors, warnings };
}

/**
 * Check a single field's system-source requirements for Level 4.
 */
function checkL4SystemSource(field, fPath, rules, warnings) {
  const hasDerivation = !!field.derivation;
  const hasDefault = field.defaultValue !== undefined && field.defaultValue !== null;
  const hasKeptRule = rules && Array.isArray(rules) &&
    rules.some(r => r.field === field.name && r.decision === 'keep' && r.active !== false);
  if (!hasDerivation && !hasDefault && !hasKeptRule) {
    warnings.push(issue(4, 'SYSTEM_NO_SOURCE', `System field '${field.name}' has no derivation, default value, or active kept rule`, fPath, 'warning'));
  }
}

/**
 * Check orphan display-field references for Level 4.
 */
function checkL4OrphanDisplayFields(fields, ePath, entityName, fieldNames, errors) {
  for (const field of fields) {
    if (field.reference && field.reference.displayField) {
      if (field.reference.entity === entityName && !fieldNames.has(field.reference.displayField)) {
        errors.push(issue(4, 'ORPHAN_FIELD', `Referenced displayField '${field.reference.displayField}' not found`, `${ePath}.fields.${field.name}.reference.displayField`));
      }
    }
  }
}

/**
 * Level 4 - Cross-reference validation.
 * Deep consistency checks, optionally using rules.
 */
function validateLevel4(schema, rules) {
  const errors = [];
  const warnings = [];

  for (const entity of schema.entities) {
    const ePath = `entities.${entity.name}`;

    if (!Array.isArray(entity.fields)) continue;

    const fieldNames = new Set(entity.fields.map(f => f.name));

    for (const field of entity.fields) {
      const fPath = `${ePath}.fields.${field.name}`;

      if (field.visibility === 'system') {
        checkL4SystemSource(field, fPath, rules, warnings);
      }

      if (field.visibility === 'readOnly' && field.derivation && field.derivation.type === 'computed') {
        if (rules && Array.isArray(rules) && !rules.some(r => r.field === field.name)) {
          warnings.push(issue(4, 'COMPUTED_NO_RULE', `ReadOnly computed field '${field.name}' has no computing rule`, fPath, 'warning'));
        }
      }

      if (field.searchable === true && field.type && !SEARCHABLE_TYPES.includes(field.type)) {
        errors.push(issue(4, 'INVALID_SEARCHABLE_TYPE', `Searchable field '${field.name}' has incompatible type: ${field.type}`, `${fPath}.searchable`));
      }
    }

    checkL4OrphanDisplayFields(entity.fields, ePath, entity.name, fieldNames, errors);
  }

  return { errors, warnings };
}

/**
 * Validate a schema through 4 levels of validation.
 *
 * Levels run sequentially. If Level 1 has errors, Levels 2-4 are skipped.
 *
 * @param {object} schema - The schema object to validate
 * @param {object[]} [rules] - Optional array of rules for Level 4 checks
 * @returns {Promise<{errors: Array, warnings: Array, maxLevel: number}>}
 */
export async function validateSchema(schema, rules) {
  const allErrors = [];
  const allWarnings = [];
  let maxLevel = 4;

  // Level 1 - Structural
  const l1 = validateLevel1(schema);
  allErrors.push(...l1.errors);
  allWarnings.push(...l1.warnings);

  // If Level 1 has errors, skip remaining levels
  if (l1.errors.length > 0) {
    maxLevel = 1;
    return { errors: allErrors, warnings: allWarnings, maxLevel };
  }

  // Level 2 - Semantic
  const l2 = validateLevel2(schema);
  allErrors.push(...l2.errors);
  allWarnings.push(...l2.warnings);

  if (l2.errors.length > 0) {
    maxLevel = 2;
    return { errors: allErrors, warnings: allWarnings, maxLevel };
  }

  // Level 3 - Visibility (requires system-columns.json)
  const systemColumns = await loadSystemColumns();
  const l3 = validateLevel3(schema, systemColumns);
  allErrors.push(...l3.errors);
  allWarnings.push(...l3.warnings);

  if (l3.errors.length > 0) {
    maxLevel = 3;
    return { errors: allErrors, warnings: allWarnings, maxLevel };
  }

  // Level 4 - Cross-reference
  const l4 = validateLevel4(schema, rules);
  allErrors.push(...l4.errors);
  allWarnings.push(...l4.warnings);

  return { errors: allErrors, warnings: allWarnings, maxLevel };
}
