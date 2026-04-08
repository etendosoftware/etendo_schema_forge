/**
 * reconcile-schema.js
 *
 * Compares schema-raw.json against decisions.json to find fields with no explicit
 * decision (unclassified) and fields in decisions but absent from raw (orphaned).
 *
 * Falls back to the old raw-vs-curated structural diff when decisions.json does not
 * exist but schema-curated.json does, preserving backward compatibility.
 *
 * Output format (decisions mode):
 * {
 *   mode: "decisions",
 *   hasDiff: boolean,  // true when there are unclassified or orphaned fields
 *   entities: {
 *     unclassified: [
 *       { entityKey, tableName, tabName, fields: [{ fieldName, columnName }] }
 *     ],
 *     orphaned: [
 *       { entityKey, fieldName }
 *     ]
 *   }
 * }
 *
 * Output format (legacy curated mode):
 * {
 *   mode: "curated",
 *   hasDiff: boolean,
 *   entities: {
 *     added:   [{ entityKey, tableName }],
 *     removed: [{ entityKey, tableName }],
 *     changed: [{ entityKey, fields: { added, removed, unchanged } }]
 *   }
 * }
 *
 * Usage (CLI):
 *   node cli/src/reconcile-schema.js <windowName>
 *
 * Programmatic:
 *   import { reconcileSchema } from './reconcile-schema.js';
 *   const diff = await reconcileSchema('sales-order');
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, '..', '..', 'artifacts');

/**
 * Build a lookup map: tableName (lowercase) → entity object.
 */
function buildEntityMap(entities) {
  const map = new Map();
  for (const entity of entities) {
    const key = (entity.tableName || '').toLowerCase();
    map.set(key, entity);
  }
  return map;
}

/**
 * Build a field lookup map: columnName (lowercase) → field object.
 */
function buildFieldMap(fields) {
  const map = new Map();
  for (const field of fields) {
    const key = (field.column || field.columnName || '').toLowerCase();
    if (key) map.set(key, field);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Decisions-based reconciliation (new model)
// ---------------------------------------------------------------------------

/**
 * Compare schema-raw against decisions.json.
 * Fields with no decision entry are "unclassified" (pipeline defaults apply but
 * the user should review them). Fields in decisions but absent from raw are
 * "orphaned" (schema changed and the decision is stale).
 */
async function reconcileWithDecisions(windowName) {
  const rawPath = join(ARTIFACTS_DIR, windowName, 'schema-raw.json');
  const decisionsPath = join(ARTIFACTS_DIR, windowName, 'decisions.json');

  const [rawText, decisionsText] = await Promise.all([
    readFile(rawPath, 'utf8'),
    readFile(decisionsPath, 'utf8'),
  ]);

  const raw = JSON.parse(rawText);
  let decisions = JSON.parse(decisionsText);

  // Auto-migrate decisions schema version if needed
  const { needsMigration, migrateDecisions } = await import('./migrations/index.js');
  if (needsMigration(decisions)) {
    const result = migrateDecisions(decisions, { schemaRaw: raw });
    decisions = result.decisions;
    await writeFile(decisionsPath, JSON.stringify(decisions, null, 2) + '\n', 'utf-8');
  }

  const rawEntities = raw.entities || [];
  // decisions.entities is a map: entityKey → { fields: { fieldKey → decision } }
  const decisionEntities = decisions.entities || {};

  const result = {
    mode: 'decisions',
    hasDiff: false,
    entities: {
      unclassified: [],
      orphaned: [],
    },
  };

  // Check each raw entity for fields without a decision
  for (const rawEntity of rawEntities) {
    const entityKey = (rawEntity.tableName || rawEntity.name || '').toLowerCase();
    const entityDecisions = decisionEntities[entityKey] || {};
    const fieldDecisions = entityDecisions.fields || {};

    const rawFields = buildFieldMap(rawEntity.fields || []);
    const unclassifiedFields = [];

    for (const [colKey, field] of rawFields) {
      // A field is unclassified if it has no entry in decisions.entities[entityKey].fields
      const fieldKey = field.name || colKey;
      if (!fieldDecisions[fieldKey] && !fieldDecisions[colKey]) {
        unclassifiedFields.push({
          fieldName: field.name || colKey,
          columnName: field.column || field.columnName || colKey,
        });
      }
    }

    if (unclassifiedFields.length > 0) {
      result.entities.unclassified.push({
        entityKey,
        tableName: rawEntity.tableName,
        tabName: rawEntity.tabName || rawEntity.name,
        fields: unclassifiedFields,
      });
    }
  }

  // Check each decision entity for fields no longer in raw (orphaned decisions)
  const rawEntityKeys = new Set(rawEntities.map(e => (e.tableName || e.name || '').toLowerCase()));

  for (const [entityKey, entityDecision] of Object.entries(decisionEntities)) {
    const rawEntity = rawEntities.find(e => (e.tableName || e.name || '').toLowerCase() === entityKey);
    if (!rawEntity) {
      // Entire entity is orphaned — collect all its field decisions
      const fieldDecisions = entityDecision.fields || {};
      for (const fieldKey of Object.keys(fieldDecisions)) {
        result.entities.orphaned.push({ entityKey, fieldName: fieldKey });
      }
      continue;
    }

    const rawFields = buildFieldMap(rawEntity.fields || []);
    const fieldDecisions = entityDecision.fields || {};

    for (const fieldKey of Object.keys(fieldDecisions)) {
      // Check whether this field still exists in raw (by name or column)
      if (!rawFields.has(fieldKey.toLowerCase())) {
        result.entities.orphaned.push({ entityKey, fieldName: fieldKey });
      }
    }
  }

  result.hasDiff =
    result.entities.unclassified.length > 0 ||
    result.entities.orphaned.length > 0;

  return result;
}

// ---------------------------------------------------------------------------
// Legacy curated-based reconciliation (backward compat)
// ---------------------------------------------------------------------------

/**
 * Compute structural diff between raw and curated schemas.
 * Used when decisions.json does not exist but schema-curated.json does.
 */
async function reconcileWithCurated(windowName) {
  const rawPath = join(ARTIFACTS_DIR, windowName, 'schema-raw.json');
  const curatedPath = join(ARTIFACTS_DIR, windowName, 'schema-curated.json');

  const [rawText, curatedText] = await Promise.all([
    readFile(rawPath, 'utf8'),
    readFile(curatedPath, 'utf8'),
  ]);

  const raw = JSON.parse(rawText);
  const curated = JSON.parse(curatedText);

  const rawEntities = raw.entities || [];
  const curatedEntities = curated.entities || [];

  const rawMap = buildEntityMap(rawEntities);
  const curatedMap = buildEntityMap(curatedEntities);

  const result = {
    mode: 'curated',
    hasDiff: false,
    entities: {
      added: [],
      removed: [],
      changed: [],
    },
  };

  // Entities in raw but not in curated (newly added tabs)
  for (const [key, entity] of rawMap) {
    if (!curatedMap.has(key)) {
      result.entities.added.push({
        entityKey: key,
        tableName: entity.tableName,
        tabName: entity.tabName || entity.name,
        fieldCount: (entity.fields || []).length,
        fields: entity.fields || [],
      });
    }
  }

  // Entities in curated but not in raw (removed/orphaned tabs)
  for (const [key, entity] of curatedMap) {
    if (!rawMap.has(key)) {
      result.entities.removed.push({
        entityKey: key,
        tableName: entity.tableName,
        tabName: entity.tabName || entity.name,
        fieldCount: (entity.fields || []).length,
      });
    }
  }

  // Entities present in both: diff their fields
  for (const [key, rawEntity] of rawMap) {
    if (!curatedMap.has(key)) continue;
    const curatedEntity = curatedMap.get(key);

    const rawFields = buildFieldMap(rawEntity.fields || []);
    const curatedFields = buildFieldMap(curatedEntity.fields || []);

    const addedFields = [];
    const removedFields = [];
    let unchangedCount = 0;

    for (const [col, field] of rawFields) {
      if (!curatedFields.has(col)) {
        addedFields.push({ columnName: field.column || field.columnName, field });
      } else {
        unchangedCount++;
      }
    }

    for (const [col, field] of curatedFields) {
      if (!rawFields.has(col)) {
        removedFields.push({ columnName: field.column || field.columnName, field });
      }
    }

    if (addedFields.length > 0 || removedFields.length > 0) {
      result.entities.changed.push({
        entityKey: key,
        tableName: rawEntity.tableName,
        tabName: rawEntity.tabName || rawEntity.name,
        fields: {
          added: addedFields,
          removed: removedFields,
          unchanged: unchangedCount,
        },
      });
    }
  }

  result.hasDiff =
    result.entities.added.length > 0 ||
    result.entities.removed.length > 0 ||
    result.entities.changed.length > 0;

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reconcile raw schema against decisions.json (or schema-curated.json as fallback).
 *
 * @param {string} windowName - artifact directory name (kebab-case)
 * @returns {Promise<object>} diff report
 */
export async function reconcileSchema(windowName) {
  const decisionsPath = join(ARTIFACTS_DIR, windowName, 'decisions.json');

  // Try decisions.json first (new model)
  try {
    await readFile(decisionsPath, 'utf8');
    return await reconcileWithDecisions(windowName);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  // Fall back to schema-curated.json (legacy model)
  return await reconcileWithCurated(windowName);
}

/**
 * Format diff as a human-readable summary for display in /classify.
 */
export function formatDiffSummary(diff) {
  if (!diff.hasDiff) {
    if (diff.mode === 'decisions') {
      return 'No unclassified fields — all raw fields have decisions.';
    }
    return 'No structural changes detected between schema-raw and schema-curated.';
  }

  const lines = ['=== Schema Drift Detected ===', ''];

  if (diff.mode === 'decisions') {
    if (diff.entities.unclassified.length > 0) {
      lines.push('UNCLASSIFIED fields (in raw, no decision entry):');
      for (const e of diff.entities.unclassified) {
        lines.push(`  + ${e.tabName} (${e.tableName}) — ${e.fields.length} field(s):`);
        for (const f of e.fields) {
          lines.push(`      ${f.fieldName} (${f.columnName})`);
        }
      }
      lines.push('');
    }

    if (diff.entities.orphaned.length > 0) {
      lines.push('ORPHANED decisions (in decisions.json, no longer in raw):');
      for (const o of diff.entities.orphaned) {
        lines.push(`  - ${o.entityKey}.${o.fieldName}`);
      }
      lines.push('');
    }

    const totalUnclassified = diff.entities.unclassified.reduce((sum, e) => sum + e.fields.length, 0);
    lines.push(`Summary: ${totalUnclassified} field(s) need decisions, ${diff.entities.orphaned.length} orphaned decision(s).`);
  } else {
    // Legacy curated mode
    if (diff.entities.added.length > 0) {
      lines.push('NEW entities (in raw, not in curated):');
      for (const e of diff.entities.added) {
        lines.push(`  + ${e.tabName} (${e.tableName}) — ${e.fieldCount} fields`);
      }
      lines.push('');
    }

    if (diff.entities.removed.length > 0) {
      lines.push('ORPHANED entities (in curated, not in raw):');
      for (const e of diff.entities.removed) {
        lines.push(`  - ${e.tabName} (${e.tableName}) — ${e.fieldCount} fields`);
      }
      lines.push('');
    }

    if (diff.entities.changed.length > 0) {
      lines.push('CHANGED entities:');
      for (const e of diff.entities.changed) {
        lines.push(`  ~ ${e.tabName} (${e.tableName}):`);
        if (e.fields.added.length > 0) {
          lines.push(`      + ${e.fields.added.length} new field(s): ${e.fields.added.map(f => f.columnName).join(', ')}`);
        }
        if (e.fields.removed.length > 0) {
          lines.push(`      - ${e.fields.removed.length} orphaned field(s): ${e.fields.removed.map(f => f.columnName).join(', ')}`);
        }
        lines.push(`      = ${e.fields.unchanged} field(s) unchanged`);
      }
      lines.push('');
    }

    const totalNew =
      diff.entities.added.reduce((sum, e) => sum + e.fieldCount, 0) +
      diff.entities.changed.reduce((sum, e) => sum + e.fields.added.length, 0);
    const totalOrphaned =
      diff.entities.removed.reduce((sum, e) => sum + e.fieldCount, 0) +
      diff.entities.changed.reduce((sum, e) => sum + e.fields.removed.length, 0);

    lines.push(`Summary: ${totalNew} field(s) to classify, ${totalOrphaned} orphaned field(s) to review.`);
  }

  return lines.join('\n');
}

// --- CLI entry point ---
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const windowName = process.argv[2];
  if (!windowName) {
    console.error('Usage: node cli/src/reconcile-schema.js <windowName>');
    process.exit(1);
  }

  try {
    const diff = await reconcileSchema(windowName);
    console.log(formatDiffSummary(diff));
    if (diff.hasDiff) {
      console.log('\n--- Raw JSON diff ---');
      console.log(JSON.stringify(diff, null, 2));
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`Missing file: ${err.path}`);
      console.error('schema-raw.json must exist. decisions.json or schema-curated.json must also exist.');
    } else {
      console.error(err.message);
    }
    process.exit(1);
  }
}
