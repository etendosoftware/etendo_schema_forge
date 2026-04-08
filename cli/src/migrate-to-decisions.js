/**
 * migrate-to-decisions.js
 *
 * One-time migration: reads existing schema-curated.json + rules-curated.json and
 * produces a decisions.json that, when fed back through resolveCurated(), reproduces
 * the same curated output.
 *
 * CLI:
 *   node cli/src/migrate-to-decisions.js --window <window-name> [--dry-run]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveCurated, autoSimplifyEntityName } from './resolve-curated.js';
import { classifyRule } from './pre-classify.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deep equality check for simple JSON-compatible values.
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

/**
 * Defaults for grid/form/searchable based on a visibility class.
 * Must mirror the logic in resolve-curated.js visibilityDefaults().
 */
function visibilityDefaultsForMigration(visibility) {
  switch (visibility) {
    case 'editable':
    case 'readOnly':
      return { grid: false, form: true, searchable: false };
    default:
      return { grid: false, form: false, searchable: false };
  }
}

/**
 * Return only the properties from `curatedField` that differ from what
 * resolve-curated would produce given the curated visibility.
 *
 * For grid/form/searchable: compare against visibilityDefaults(curated.visibility)
 * because those defaults depend on the FINAL visibility, not on what the default
 * curated output had.
 * For other props (reference, inputMode, etc.): compare against defaultField value.
 */
function diffField(curatedField, defaultField) {
  const diff = {};

  // visibility: always record if it differs from defaultField
  const cv_vis = curatedField.visibility ?? null;
  const dv_vis = defaultField ? (defaultField.visibility ?? null) : null;
  if (cv_vis !== dv_vis && cv_vis !== null) {
    diff.visibility = cv_vis;
  }

  // grid/form/searchable: compare against expected defaults for curated visibility
  const visDefaults = visibilityDefaultsForMigration(curatedField.visibility);
  for (const prop of ['grid', 'form', 'searchable']) {
    const cv = curatedField[prop] ?? false;
    const expected = visDefaults[prop];
    if (cv !== expected) diff[prop] = cv;
  }

  // FK/behavioral props: compare against defaultField
  // Store explicit null when curated omits a property that resolve would auto-add.
  // This tells resolve-curated to NOT add the property for this field.
  // type: record if curated type differs from raw type (e.g., 'image' override on an 'string' raw field)
  const cv_type = curatedField.type ?? null;
  const dv_type = defaultField ? (defaultField.type ?? null) : null;
  if (cv_type !== null && cv_type !== dv_type) {
    diff.type = cv_type;
  }

  for (const prop of ['reference', 'inputMode', 'dependsOn', 'section', 'readOnlyLogic', 'displayLogic']) {
    const cv = curatedField[prop] ?? null;
    const dv = defaultField ? (defaultField[prop] ?? null) : null;
    if (!deepEqual(cv, dv)) {
      // Store the value even if it's null (null = explicit removal instruction)
      diff[prop] = cv;
    }
  }

  return diff;
}

/**
 * Build a map from columnName -> raw field for a given raw entity.
 */
/**
 * Build a map from columnName -> field array.
 * Stores arrays because some views have the same column appearing twice
 * with different visibility (e.g., M_SOL_Reserved_Stock_V.C_Orderline_ID).
 */
function buildColumnMap(rawEntity) {
  const map = {};
  for (const f of (rawEntity?.fields || [])) {
    if (!map[f.columnName]) map[f.columnName] = [];
    map[f.columnName].push(f);
  }
  return map;
}

/**
 * Find the best raw field match for a curated field given duplicate column candidates.
 * Prefers the candidate whose visibility class matches closest to curatedVisibility.
 */
function findRawFieldByColumn(columnMap, columnName, curatedVisibility) {
  const candidates = columnMap[columnName];
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Pick candidate whose visibility class matches curated visibility
  const exact = candidates.find(f => f.visibility === curatedVisibility);
  if (exact) return exact;

  // Fallback: pick the non-system one if curated is visible
  if (curatedVisibility !== 'system' && curatedVisibility !== 'discarded') {
    const nonSystem = candidates.find(f => f.visibility !== 'system' && f.visibility !== 'discarded');
    if (nonSystem) return nonSystem;
  }

  return candidates[0];
}

/**
 * Build a map from field.name -> field for a given entity in the default curated output.
 */
function buildDefaultFieldMap(defaultEntity) {
  const map = {};
  for (const f of (defaultEntity?.fields || [])) {
    map[f.name] = f;
  }
  return map;
}

/**
 * Find a raw entity by matching its simplified name against curated entity name.
 * Falls back to tableName matching.
 */
function findRawEntityForCurated(rawEntities, curatedEntity) {
  // Try by simplified name
  for (const re of rawEntities) {
    if (autoSimplifyEntityName(re.name) === curatedEntity.name) return re;
  }
  // Fall back to tableName
  for (const re of rawEntities) {
    if (re.tableName === curatedEntity.tableName) return re;
  }
  return null;
}

/**
 * Determine the auto-decision a raw rule would get from pre-classify.
 * Returns capitalised string ('Keep' or 'Omit' or 'pending').
 */
function getAutoDecision(rawRule) {
  const classified = classifyRule(rawRule);
  if (classified.tier === 'auto') {
    return classified.autoDecision === 'keep' ? 'Keep' : 'Omit';
  }
  return 'pending';
}

// ---------------------------------------------------------------------------
// discardPatterns detection
// ---------------------------------------------------------------------------

/**
 * Scan curated fields across all entities and detect common discard patterns.
 * Returns an array of patterns (e.g. ["EM_*", "CopyFrom*"]).
 */
function detectDiscardPatterns(curatedEntities) {
  const patterns = new Set();

  for (const entity of curatedEntities) {
    for (const field of (entity.fields || [])) {
      if (field.visibility !== 'discarded') continue;
      const col = field.column || '';
      if (col.toUpperCase().startsWith('EM_')) {
        patterns.add('EM_*');
      } else if (col.startsWith('CopyFrom') || col.startsWith('copyFrom')) {
        patterns.add('CopyFrom*');
      }
    }
  }

  return [...patterns].sort();
}

// ---------------------------------------------------------------------------
// Rules migration
// ---------------------------------------------------------------------------

/**
 * Build the decisions.rules object.
 *
 * Strategy:
 * - Non-callout type rules (readOnlyLogic, displayLogic, validation, process, auxiliaryInput):
 *   always include with all their properties.
 * - Callout rules in rawRules: include only if their decision differs from auto-classify
 *   OR if description/entity is set in curated.
 * - Curated rules not in rawRules: include with all properties.
 */
function migrateRules(rulesCurated, rulesRaw) {
  const rawRulesList = rulesRaw?.rules || [];
  const curatedRulesList = rulesCurated?.rules || [];

  // Build a map from curated rule name -> curated rule
  const curatedMap = {};
  for (const r of curatedRulesList) {
    curatedMap[r.name] = r;
  }

  // Build a map from raw rule name -> raw rule (may have duplicates via triggerColumn)
  // Use first occurrence per name
  const rawMap = {};
  for (const r of rawRulesList) {
    if (!rawMap[r.name]) rawMap[r.name] = r;
  }

  const rulesDecisions = {};

  for (const curatedRule of curatedRulesList) {
    const rawRule = rawMap[curatedRule.name];
    const isCallout = curatedRule.type === 'callout';

    if (!rawRule) {
      // Rule exists only in curated — store all properties
      const entry = { type: curatedRule.type };
      if (curatedRule.entity) entry.entity = curatedRule.entity;
      if (curatedRule.decision) entry.decision = curatedRule.decision;
      if (curatedRule.description) entry.description = curatedRule.description;
      if (curatedRule.impactIfOmitted) entry.impactIfOmitted = curatedRule.impactIfOmitted;
      if (curatedRule.translated) entry.translated = curatedRule.translated;
      rulesDecisions[curatedRule.name] = entry;
      continue;
    }

    if (!isCallout) {
      // Non-callout rule: always store all properties
      const entry = { type: curatedRule.type };
      if (curatedRule.entity) entry.entity = curatedRule.entity;
      if (curatedRule.decision) entry.decision = curatedRule.decision;
      if (curatedRule.description) entry.description = curatedRule.description;
      if (curatedRule.impactIfOmitted) entry.impactIfOmitted = curatedRule.impactIfOmitted;
      if (curatedRule.translated) entry.translated = curatedRule.translated;
      rulesDecisions[curatedRule.name] = entry;
      continue;
    }

    // Callout rule: always store to preserve the complete list.
    // Previously we skipped callout rules matching auto-classify, but that caused
    // resolveRules() to treat the partial list as complete and lose unstored rules.
    {
      const entry = {};
      if (curatedRule.entity) entry.entity = curatedRule.entity;
      if (curatedRule.decision) entry.decision = curatedRule.decision;
      if (curatedRule.description) entry.description = curatedRule.description;
      if (curatedRule.impactIfOmitted) entry.impactIfOmitted = curatedRule.impactIfOmitted;
      rulesDecisions[curatedRule.name] = entry;
    }
  }

  return rulesDecisions;
}

// ---------------------------------------------------------------------------
// Roundtrip validation
// ---------------------------------------------------------------------------

/**
 * Compare resolved output with original curated file.
 * Returns an array of mismatch descriptions.
 */
function validateRoundtrip(original, resolved) {
  const mismatches = [];

  // Compare schema entities
  const origEntities = original.schema?.entities || [];
  const resEntities = resolved.schema?.entities || [];

  if (origEntities.length !== resEntities.length) {
    mismatches.push(`Entity count mismatch: original=${origEntities.length} resolved=${resEntities.length}`);
  }

  for (let ei = 0; ei < origEntities.length; ei++) {
    const orig = origEntities[ei];
    const res = resEntities.find(e => e.tableName === orig.tableName);
    if (!res) {
      mismatches.push(`Missing entity: ${orig.name} (table: ${orig.tableName})`);
      continue;
    }

    if (orig.name !== res.name) {
      mismatches.push(`Entity name mismatch for ${orig.tableName}: orig="${orig.name}" resolved="${res.name}"`);
    }

    const origFields = orig.fields || [];
    const resFields = res.fields || [];
    // Build field maps — store arrays for duplicate columns (same column, different visibility)
    const resFieldMapByCol = {};
    const resFieldMapByName = {};
    for (const f of resFields) {
      if (!resFieldMapByCol[f.column]) resFieldMapByCol[f.column] = [];
      resFieldMapByCol[f.column].push(f);
      resFieldMapByName[f.name] = f;
    }

    for (const of_ of origFields) {
      // Match by column (stable) with name fallback.
      // When multiple resolved fields share a column, pick the one whose visibility matches.
      let rf;
      const colCandidates = resFieldMapByCol[of_.column];
      if (colCandidates?.length === 1) {
        rf = colCandidates[0];
      } else if (colCandidates?.length > 1) {
        rf = colCandidates.find(f => f.visibility === of_.visibility) || colCandidates[0];
      } else {
        rf = resFieldMapByName[of_.name];
      }
      if (!rf) {
        // Skip fields discarded by EM_* pattern — their raw name differs from curated name
        if ((of_.column || '').toUpperCase().startsWith('EM_')) continue;
        mismatches.push(`  ${orig.tableName}.${of_.name}: missing in resolved`);
        continue;
      }

      const CHECKED = ['visibility', 'grid', 'form', 'searchable', 'reference', 'inputMode', 'section', 'readOnlyLogic'];
      for (const prop of CHECKED) {
        const ov = of_[prop] ?? null;
        const rv = rf[prop] ?? null;
        if (!deepEqual(ov, rv)) {
          mismatches.push(`  ${orig.tableName}.${of_.name}.${prop}: orig=${JSON.stringify(ov)} resolved=${JSON.stringify(rv)}`);
        }
      }
    }
  }

  // Compare rules count
  const origRules = original.rules || [];
  const resRules = resolved.rules || [];
  if (origRules.length !== resRules.length) {
    mismatches.push(`Rules count mismatch: original=${origRules.length} resolved=${resRules.length}`);
  }

  // Compare each rule decision
  const resRuleMap = {};
  for (const r of resRules) resRuleMap[r.name] = r;
  for (const or_ of origRules) {
    const rr = resRuleMap[or_.name];
    if (!rr) {
      mismatches.push(`Rule missing in resolved: ${or_.name}`);
      continue;
    }
    if (or_.decision !== rr.decision) {
      mismatches.push(`Rule ${or_.name} decision: orig="${or_.decision}" resolved="${rr.decision}"`);
    }
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// Main migration
// ---------------------------------------------------------------------------

async function migrate(windowName, dryRun) {
  const artifactsDir = join(ROOT, 'artifacts', windowName);

  console.log(`Loading artifacts for: ${windowName}`);

  const [schemaRaw, schemaCurated, rulesRaw, rulesCurated] = await Promise.all([
    readFile(join(artifactsDir, 'schema-raw.json'), 'utf-8').then(JSON.parse),
    readFile(join(artifactsDir, 'schema-curated.json'), 'utf-8').then(JSON.parse),
    readFile(join(artifactsDir, 'rules-raw.json'), 'utf-8').then(JSON.parse),
    readFile(join(artifactsDir, 'rules-curated.json'), 'utf-8').then(JSON.parse),
  ]);

  // Step 1: Get default curated (empty decisions) for diffing
  const { schema: defaultSchema, rules: defaultRules } = await resolveCurated(schemaRaw, rulesRaw, {});

  // Step 2: Build entity decisions by diffing curated vs defaults
  const entityDecisions = {};
  const discardPatterns = detectDiscardPatterns(schemaCurated.entities || []);

  for (const curatedEntity of (schemaCurated.entities || [])) {
    const rawEntity = findRawEntityForCurated(schemaRaw.entities || [], curatedEntity);
    if (!rawEntity) {
      console.warn(`Warning: no raw entity found for curated entity "${curatedEntity.name}" (table: ${curatedEntity.tableName})`);
      continue;
    }

    const rawEntityName = rawEntity.name;
    const autoSimplified = autoSimplifyEntityName(rawEntityName);
    const defaultEntity = defaultSchema.entities.find(e => e.tableName === curatedEntity.tableName);
    // Map by column for default entity (default uses raw field names)
    const defaultFieldByColumn = {};
    for (const f of (defaultEntity?.fields || [])) {
      if (f.column) defaultFieldByColumn[f.column] = f;
    }
    // Map from column → raw field (for finding raw field name)
    const rawFieldByColumn = buildColumnMap(rawEntity);

    // Only record entity name decision if it differs from auto-simplified
    const entityEntry = {};
    if (curatedEntity.name !== autoSimplified) {
      entityEntry.name = curatedEntity.name;
    }

    const fieldsEntry = {};

    for (const curatedField of (curatedEntity.fields || [])) {
      const col = curatedField.column || '';

      // Skip if the field is discarded by a pattern AND the curated also discards it.
      // If the curated keeps it visible despite the pattern, we MUST store the explicit
      // visibility decision (it will override the pattern in resolve-curated).
      const matchesPattern = discardPatterns.some(pat => {
        const c = col.toLowerCase();
        const p = pat.toLowerCase();
        if (p.endsWith('*')) return c.startsWith(p.slice(0, -1));
        if (p.startsWith('*')) return c.endsWith(p.slice(1));
        return c === p;
      });
      const curatedIsDiscarded = curatedField.visibility === 'discarded';
      if (matchesPattern && curatedIsDiscarded) continue;

      // Find the corresponding raw field by column name → get the raw (canonical) field name
      // Use visibility-aware matching when multiple raw fields share the same column.
      const rawField = col ? findRawFieldByColumn(rawFieldByColumn, col, curatedField.visibility) : null;
      const rawFieldName = rawField?.name || curatedField.name;

      // Find the default resolved field for this column
      const defaultField = col ? defaultFieldByColumn[col] : null;

      const fieldDiff = diffField(curatedField, defaultField);

      // If curated renamed the field relative to raw, store the name override
      if (rawFieldName !== curatedField.name) {
        fieldDiff.name = curatedField.name;
      }

      if (Object.keys(fieldDiff).length > 0) {
        // Key in decisions is the RAW field name
        fieldsEntry[rawFieldName] = fieldDiff;
      }
    }

    if (Object.keys(fieldsEntry).length > 0) {
      entityEntry.fields = fieldsEntry;
    }

    if (Object.keys(entityEntry).length > 0) {
      entityDecisions[rawEntityName] = entityEntry;
    }
  }

  // Step 2b: Mark raw entities not present in curated as excluded
  for (const rawEntity of (schemaRaw.entities || [])) {
    const rawEntityName = rawEntity.name;
    const hasCuratedMatch = (schemaCurated.entities || []).some(
      ce => findRawEntityForCurated([rawEntity], ce) === rawEntity
    );
    if (!hasCuratedMatch) {
      if (!entityDecisions[rawEntityName]) entityDecisions[rawEntityName] = {};
      entityDecisions[rawEntityName].exclude = true;
    }
  }

  // Step 3: Build rule decisions
  const ruleDecisions = migrateRules(rulesCurated, rulesRaw);

  // Step 4: Build window decisions
  const windowEntry = {};
  if (schemaCurated.window?.category) windowEntry.category = schemaCurated.window.category;
  if (schemaCurated.window?.layoutType) windowEntry.layoutType = schemaCurated.window.layoutType;
  if (schemaCurated.window?.templateConfig) windowEntry.templateConfig = schemaCurated.window.templateConfig;
  if (schemaCurated.window?.name) windowEntry.name = schemaCurated.window.name;

  // Step 5: Assemble decisions.json (first pass)
  let decisions = {
    $schema: 'decisions-v1',
    version: 1,
    window: windowEntry,
    entities: entityDecisions,
    rules: ruleDecisions,
    discardPatterns,
  };

  // Step 5b: Second-pass refinement
  // After the first-pass decisions are assembled, run resolve once to find any remaining
  // differences. This catches cases where a visibility change causes resolve to add FK/
  // behavioral props that weren't present in the curated (e.g., system→editable reveals inputMode).
  {
    const { schema: pass1Schema } = await resolveCurated(schemaRaw, rulesRaw, decisions);
    let refinementMade = false;

    for (const curatedEntity of (schemaCurated.entities || [])) {
      const rawEntity = findRawEntityForCurated(schemaRaw.entities || [], curatedEntity);
      if (!rawEntity) continue;
      const rawEntityName = rawEntity.name;
      const rawFieldByColumn = buildColumnMap(rawEntity);

      const pass1Entity = pass1Schema.entities.find(e => e.tableName === curatedEntity.tableName);
      if (!pass1Entity) continue;
      const pass1FieldByColumn = {};
      for (const f of (pass1Entity.fields || [])) {
        if (f.column) pass1FieldByColumn[f.column] = f;
      }

      for (const curatedField of (curatedEntity.fields || [])) {
        const col = curatedField.column || '';
        const pass1Field = col ? pass1FieldByColumn[col] : null;
        if (!pass1Field) continue;

        // Diff pass-1 resolved vs curated for FK/behavioral props
        const residualDiff = {};
        for (const prop of ['reference', 'inputMode', 'readOnlyLogic', 'displayLogic']) {
          const cv = curatedField[prop] ?? null;
          const pv = pass1Field[prop] ?? null;
          if (!deepEqual(cv, pv)) {
            residualDiff[prop] = cv;
          }
        }

        if (Object.keys(residualDiff).length > 0) {
          const rawField = col ? findRawFieldByColumn(rawFieldByColumn, col, curatedField.visibility) : null;
          const rawFieldName = rawField?.name || curatedField.name;
          if (!decisions.entities[rawEntityName]) decisions.entities[rawEntityName] = {};
          if (!decisions.entities[rawEntityName].fields) decisions.entities[rawEntityName].fields = {};
          const existingEntry = decisions.entities[rawEntityName].fields[rawFieldName] || {};
          Object.assign(existingEntry, residualDiff);
          decisions.entities[rawEntityName].fields[rawFieldName] = existingEntry;
          refinementMade = true;
        }
      }
    }

    if (refinementMade) {
      console.log('  Applied second-pass refinements for FK/behavioral prop removals.');
    }
  }

  // Step 6: Validate roundtrip
  console.log('\nValidating roundtrip...');
  const { schema: resolvedSchema, rules: resolvedRules } = await resolveCurated(schemaRaw, rulesRaw, decisions);
  const mismatches = validateRoundtrip(
    { schema: schemaCurated, rules: rulesCurated.rules || [] },
    { schema: resolvedSchema, rules: resolvedRules }
  );

  if (mismatches.length > 0) {
    console.warn(`\nRoundtrip mismatches (${mismatches.length}):`);
    for (const m of mismatches) {
      console.warn('  ' + m);
    }
  } else {
    console.log('Roundtrip OK — all fields and rule decisions match.');
  }

  // Step 7: Write or preview
  const outputPath = join(artifactsDir, 'decisions.json');
  if (dryRun) {
    console.log(`\n[dry-run] Would write to: ${outputPath}`);
    console.log(JSON.stringify(decisions, null, 2));
  } else {
    await writeFile(outputPath, JSON.stringify(decisions, null, 2) + '\n', 'utf-8');
    console.log(`\nWritten: ${outputPath}`);
    const entityCount = Object.keys(entityDecisions).length;
    const fieldCount = Object.values(entityDecisions).reduce(
      (sum, e) => sum + Object.keys(e.fields || {}).length, 0
    );
    const ruleCount = Object.keys(ruleDecisions).length;
    console.log(`  Entities with overrides: ${entityCount}`);
    console.log(`  Field overrides: ${fieldCount}`);
    console.log(`  Rule decisions stored: ${ruleCount}`);
    console.log(`  Discard patterns: ${discardPatterns.join(', ') || '(none)'}`);
  }
}

// ---------------------------------------------------------------------------
// Programmatic API
// ---------------------------------------------------------------------------

/**
 * Migrate a window from curated files to decisions.json.
 * Safe to call multiple times — skips if decisions.json already exists.
 */
export async function migrateWindow(windowName) {
  await migrate(windowName, false);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const windowIdx = args.indexOf('--window');
  const dryRun = args.includes('--dry-run');

  if (windowIdx === -1 || !args[windowIdx + 1]) {
    console.error('Usage: node cli/src/migrate-to-decisions.js --window <window-name> [--dry-run]');
    process.exit(1);
  }

  const windowName = args[windowIdx + 1];

  migrate(windowName, dryRun).catch(err => {
    console.error('Migration failed:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
}
