/**
 * resolve-curated.js
 *
 * Core algorithm: raw schema + raw rules + decisions -> curated schema + curated rules in memory.
 * No DB access. Zero external dependencies beyond Node.js built-ins and project imports.
 *
 * Exports:
 *   resolveCurated(schemaRaw, rulesRaw, decisions) -> { schema, rules }
 *   autoSimplifyEntityName(rawName) -> string
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyRule } from './pre-classify.js';
import { toCamelCase } from './utils.js';
import { migrateDecisions, needsMigration, getVersion } from './migrations/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Entity name helpers
// ---------------------------------------------------------------------------

/**
 * Strip common lowercase prefixes (c, m, ad) if followed by an uppercase letter.
 * cOrder -> order, cOrderLine -> orderLine, mProduct -> product, adUser -> user
 */
export function autoSimplifyEntityName(rawName) {
  if (!rawName) return rawName;
  // Replace slashes with camelCase join: "vendor/creditor" → "vendorCreditor"
  let name = rawName.includes('/')
    ? rawName.split('/').map((seg, i) => i === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1)).join('')
    : rawName;
  const match = name.match(/^(c|m|ad)([A-Z].*)$/);
  if (match) {
    const rest = match[2];
    return rest.charAt(0).toLowerCase() + rest.slice(1);
  }
  return name;
}

// ---------------------------------------------------------------------------
// Catalog name helpers
// ---------------------------------------------------------------------------

const TABLE_PREFIXES = ['APRM_', 'OBUISEL_', 'FIN_', 'EM_', 'AD_', 'C_', 'M_', 'A_'];

/**
 * Derive a catalog name from a targetTable string by stripping known prefixes.
 * C_BPartner -> BPartner, AD_Org -> Org, M_PriceList -> PriceList
 */
function autoDeriveCatalogName(targetTable) {
  if (!targetTable) return null;
  let name = targetTable;
  for (const prefix of TABLE_PREFIXES) {
    if (name.toUpperCase().startsWith(prefix)) {
      name = name.slice(prefix.length);
      break;
    }
  }
  return name || null;
}

// ---------------------------------------------------------------------------
// Input mode helpers
// ---------------------------------------------------------------------------

/**
 * Determine default inputMode for a FK field when not overridden by decisions.
 * dependsOn in decision -> dependent (handled before this function is called)
 */
function defaultInputMode(field) {
  const refType = field.reference?.type;
  if (!refType) return 'selector';
  switch (refType) {
    case 'TableDir': return 'selector';
    case 'Table': return 'search';
    case 'Search': return 'search';
    case 'Selector': return 'selector';
    default: return 'selector';
  }
}

// ---------------------------------------------------------------------------
// discardPatterns helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if columnName matches a glob pattern.
 * Supported: trailing * (prefix match) and leading * (suffix match).
 * Exact match for patterns without *.
 */
function matchesGlob(columnName, pattern) {
  const col = columnName.toLowerCase();
  const pat = pattern.toLowerCase();
  if (pat.endsWith('*')) {
    return col.startsWith(pat.slice(0, -1));
  }
  if (pat.startsWith('*')) {
    return col.endsWith(pat.slice(1));
  }
  return col === pat;
}

function isDiscardedByPattern(columnName, discardPatterns) {
  if (!discardPatterns || discardPatterns.length === 0) return false;
  for (const pattern of discardPatterns) {
    if (matchesGlob(columnName, pattern)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Field defaults
// ---------------------------------------------------------------------------

/**
 * Defaults for grid/form/searchable based on visibility class.
 */
function visibilityDefaults(visibility) {
  switch (visibility) {
    case 'editable':
      return { grid: false, form: true, searchable: false };
    case 'readOnly':
      return { grid: false, form: true, searchable: false };
    case 'system':
    case 'discarded':
    default:
      return { grid: false, form: false, searchable: false };
  }
}

// ---------------------------------------------------------------------------
// Category inference
// ---------------------------------------------------------------------------

function inferCategory(windowName) {
  const name = windowName || '';
  if (/Sales/i.test(name)) return 'sales';
  if (/Purchase/i.test(name)) return 'purchases';
  if (/Invoice/i.test(name)) return 'finance';
  if (/Inventory|Stock|Warehouse/i.test(name)) return 'inventory';
  if (/Account|Journal|Ledger/i.test(name)) return 'accounting';
  if (/Product|Price|BOM/i.test(name)) return 'master';
  if (/Project/i.test(name)) return 'project';
  return 'general';
}

// ---------------------------------------------------------------------------
// Field builder
// ---------------------------------------------------------------------------

/**
 * Build a curated field object from a raw field + merged decisions.
 * Prunes all null/undefined properties before returning.
 */
function buildCuratedField(rawField, fieldDecision, discardPatterns) {
  const columnName = rawField.columnName || rawField.column || '';

  // Check discard patterns first
  const discardedByPattern = isDiscardedByPattern(columnName, discardPatterns);

  let visibility = discardedByPattern ? 'discarded' : rawField.visibility;

  // Apply decision visibility override — explicit decisions always win, even over discard patterns.
  // This lets human decisions rescue specific EM_* fields that should remain visible.
  if (fieldDecision.visibility) {
    visibility = fieldDecision.visibility;
  }

  const defaults = visibilityDefaults(visibility);

  // Merge: defaults <- raw overrides <- decision overrides
  const grid = fieldDecision.grid !== undefined
    ? fieldDecision.grid
    : defaults.grid;

  const form = fieldDecision.form !== undefined
    ? fieldDecision.form
    : defaults.form;

  const searchable = fieldDecision.searchable !== undefined
    ? fieldDecision.searchable
    : defaults.searchable;

  const required = rawField.mandatory || false;

  // Apply optional name override from decision
  const fieldName = fieldDecision.name || rawField.name;

  // Build the field object
  const field = {
    name: fieldName,
    column: rawField.columnName,
    label: fieldDecision.label || rawField.label,
    type: fieldDecision.type || (rawField.type === 'id' ? 'id' : rawField.type),
    visibility,
    required,
    grid,
    form,
    searchable,
  };

  // Section (only for visible fields)
  const section = fieldDecision.section || null;
  if (section) field.section = section;

  // Optional sequence override for UI ordering within section
  if (fieldDecision.seq != null) field.seq = fieldDecision.seq;

  // Visual hints — badge (boolean pill), summable (numeric footer total), columnType override
  if (fieldDecision.badge) field.badge = true;
  if (fieldDecision.badgeLabels) field.badgeLabels = fieldDecision.badgeLabels;
  if (fieldDecision.summable) field.summable = true;
  if (fieldDecision.columnType) field.columnType = fieldDecision.columnType;
  if (fieldDecision.display) field.display = fieldDecision.display;

  const isVisible = visibility !== 'system' && visibility !== 'discarded';

  // FK-specific fields: only for visible fields
  // Explicit null in decision means "omit this property" (migration carries over intentional removals)
  if (rawField.type === 'foreignKey' && isVisible) {
    if (fieldDecision.reference !== null) {
      const catalogName = fieldDecision.reference
        || autoDeriveCatalogName(rawField.reference?.targetTable)
        || null;
      if (catalogName) field.reference = catalogName;
    }

    // inputMode: explicit null in decision → omit; decision value → use it; otherwise auto
    if (fieldDecision.inputMode !== null) {
      const dependsOn = fieldDecision.dependsOn || null;
      let inputMode;
      if (dependsOn) {
        inputMode = 'dependent';
      } else {
        inputMode = fieldDecision.inputMode || defaultInputMode(rawField);
      }
      field.inputMode = inputMode;
    }

    const dependsOn = fieldDecision.dependsOn || null;
    if (dependsOn) field.dependsOn = dependsOn;

    if (fieldDecision.lookup) field.lookup = true;
  }

  // derivation — carry from raw field
  if (rawField.derivation) {
    field.derivation = rawField.derivation;
  }

  if (rawField.defaultValue !== undefined) {
    field.defaultValue = rawField.defaultValue;
  }

  // readOnlyLogic and displayLogic: only for visible fields
  // Explicit null in decision means "omit this property"
  if (isVisible) {
    if (fieldDecision.readOnlyLogic !== null) {
      const readOnlyLogic = fieldDecision.readOnlyLogic || rawField.readOnlyLogic || null;
      if (readOnlyLogic) field.readOnlyLogic = readOnlyLogic;
    }

    if (fieldDecision.displayLogic !== null) {
      const displayLogic = fieldDecision.displayLogic || rawField.displayLogic || null;
      if (displayLogic) field.displayLogic = displayLogic;
    }

    if (fieldDecision.displayLogicJs != null) {
      field.displayLogicJs = fieldDecision.displayLogicJs;
    }

    // callout — carry from raw
    if (rawField.callout) field.callout = rawField.callout;
  }

  // enumValues
  if (rawField.enumValues) field.enumValues = rawField.enumValues;

  // Passthrough process metadata for button fields
  if (rawField.processId) field.processId = rawField.processId;
  if (rawField.processType) field.processType = rawField.processType;

  return field;
}

// ---------------------------------------------------------------------------
// Rules resolver
// ---------------------------------------------------------------------------

/**
 * Resolve rules for the curated output.
 *
 * Strategy:
 * - If decisions.rules is non-empty: use it as the complete rules list.
 *   Rules in decisions are keyed by the canonical name used in the curated schema
 *   (which may include the trigger-column suffix, e.g. "SL_Order_Amt_QtyOrdered").
 *   Each entry is emitted as a rule object with the name injected.
 * - If decisions.rules is empty: auto-classify raw rules via pre-classify.js,
 *   deduplicating by (name + triggerColumn) into a unique extended name.
 */
function resolveRules(rulesRaw, decisions) {
  const ruleDecisions = decisions.rules || {};

  // When decisions has explicit rules, use them as the complete curated list.
  // This preserves human-crafted naming conventions (e.g. extended names that include
  // the trigger column) and avoids re-deriving from raw rules which may have different
  // naming schemes.
  if (Object.keys(ruleDecisions).length > 0) {
    return Object.entries(ruleDecisions).map(([ruleName, dec]) => {
      const rule = { name: ruleName };
      if (dec.type) rule.type = dec.type;
      if (dec.entity) rule.entity = dec.entity;
      if (dec.decision) rule.decision = dec.decision;
      if (dec.description) rule.description = dec.description;
      if (dec.impactIfOmitted) rule.impactIfOmitted = dec.impactIfOmitted;
      if (dec.translated) rule.translated = dec.translated;
      return rule;
    });
  }

  // No decisions yet — auto-classify raw rules (first-time window, no /classify run yet).
  // Produce one entry per unique (name + triggerColumn) pair.
  const rawRulesList = rulesRaw?.rules || [];
  const result = [];
  const seen = new Set();

  for (const rawRule of rawRulesList) {
    const extName = rawRule.triggerColumn
      ? `${rawRule.name}_${rawRule.triggerColumn}`
      : rawRule.name;
    if (seen.has(extName)) continue;
    seen.add(extName);

    const classified = classifyRule(rawRule);
    const decision = classified.tier === 'auto'
      ? (classified.autoDecision === 'keep' ? 'Keep' : 'Omit')
      : 'pending';

    result.push({
      name: extName,
      type: rawRule.type,
      decision,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Entity decision matching (backward compatible with tableName-based keys)
// ---------------------------------------------------------------------------

/**
 * Find the decisions entry for a raw entity, trying multiple matching strategies.
 * This ensures backward compatibility when old decisions use tableName-based keys
 * (e.g., "cOrder") but the raw schema now uses tabName-based keys (e.g., "header").
 *
 * @param {Object} rawEntity - Raw entity with name, tableName properties
 * @param {Object} entitiesDecisions - The decisions.entities map
 * @returns {Object} The matching decision object, or {} if none found
 */
function findEntityDecision(rawEntity, entitiesDecisions) {
  // 1. Exact match by current name (tabName-based)
  if (entitiesDecisions[rawEntity.name]) return entitiesDecisions[rawEntity.name];

  // 2. Match by auto-simplified name (handles slash-named entities like "location/address" → "locationAddress")
  const autoSimplified = autoSimplifyEntityName(rawEntity.name);
  if (autoSimplified !== rawEntity.name && entitiesDecisions[autoSimplified]) {
    return entitiesDecisions[autoSimplified];
  }

  // 3. Fallback: match by tableName derivation (handles unmigrated decisions)
  if (rawEntity.tableName) {
    const tableBasedKey = toCamelCase(rawEntity.tableName);
    if (entitiesDecisions[tableBasedKey]) return entitiesDecisions[tableBasedKey];

    // Also try the auto-simplified version (strips c/m/ad prefix)
    const simplified = autoSimplifyEntityName(tableBasedKey);
    if (simplified !== tableBasedKey && entitiesDecisions[simplified]) {
      return entitiesDecisions[simplified];
    }
  }

  // 4. Match by name override in decision value
  for (const [, decVal] of Object.entries(entitiesDecisions)) {
    if (decVal.name === rawEntity.name) return decVal;
  }

  return {};
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve raw schema + raw rules + decisions into curated schema + curated rules.
 *
 * @param {Object} schemaRaw  - Parsed schema-raw.json
 * @param {Object} rulesRaw   - Parsed rules-raw.json
 * @param {Object} decisions  - Parsed decisions.json (may be empty {})
 * @returns {{ schema: Object, rules: Array }}
 */
export async function resolveCurated(schemaRaw, rulesRaw, decisions) {
  // Migrate decisions to current version if needed (in-memory only, no file write)
  if (needsMigration(decisions)) {
    const fromV = getVersion(decisions);
    const result = migrateDecisions(decisions, { schemaRaw });
    decisions = result.decisions;
    console.log(`  decisions migrated in-memory: v${fromV} → v${result.toVersion}`);
  }

  const discardPatterns = decisions.discardPatterns || [];
  const entitiesDecisions = decisions.entities || {};

  const curatedEntities = [];

  for (const rawEntity of (schemaRaw.entities || [])) {
    const rawEntityName = rawEntity.name;
    const entityDecision = findEntityDecision(rawEntity, entitiesDecisions);

    // Skip entities explicitly excluded via decisions
    if (entityDecision.exclude === true) continue;

    const simplifiedName = entityDecision.name || autoSimplifyEntityName(rawEntityName);
    const fieldsDecisions = entityDecision.fields || {};

    // Build a column-name index for decision fallback lookup.
    // Decision keys may use an older raw naming convention (e.g. cBpartnerLocationId)
    // while the current raw uses a simplified name (e.g. partnerAddress).
    // The column name (e.g. C_BPartner_Location_ID) is stable across extractions.
    const fieldDecisionsByColumn = {};
    for (const [decKey, decVal] of Object.entries(fieldsDecisions)) {
      // We don't know the column from the key alone, so we'll match below
      fieldDecisionsByColumn[decKey] = decVal;
    }

    const curatedFields = (rawEntity.fields || []).map(rawField => {
      const fieldKey = rawField.name;
      let fieldDecision = fieldsDecisions[fieldKey];
      if (!fieldDecision && rawField.columnName) {
        // Fallback: find a decision whose 'name' override matches rawField.name,
        // or whose key matches a camelCase derivation of the column name
        for (const [decKey, decVal] of Object.entries(fieldsDecisions)) {
          if (decVal.name === rawField.name) {
            fieldDecision = decVal;
            break;
          }
        }
      }
      fieldDecision = fieldDecision || {};
      return buildCuratedField(rawField, fieldDecision, discardPatterns);
    });

    // Apply explicit field ordering from decisions (order: number on individual fields)
    const hasOrderOverrides = Object.values(fieldsDecisions).some(d => d.order != null);
    const orderedFields = hasOrderOverrides
      ? curatedFields.slice().sort((a, b) => {
          const oa = fieldsDecisions[a.name]?.order ?? fieldsDecisions[a.columnName]?.order ?? Infinity;
          const ob = fieldsDecisions[b.name]?.order ?? fieldsDecisions[b.columnName]?.order ?? Infinity;
          return oa - ob;
        })
      : curatedFields;

    const entity = {
      name: simplifiedName,
      tableName: rawEntity.tableName,
      tabId: rawEntity.tabId,
      tabName: rawEntity.tabName,
      fields: orderedFields,
    };

    // Propagate javaQualifier from decisions (e.g., FactAcctHandler for Accounting tabs)
    if (entityDecision.javaQualifier) {
      entity.javaQualifier = entityDecision.javaQualifier;
    }

    // Propagate draftMode from decisions (enables Save Draft + Save & Process buttons)
    if (entityDecision.draftMode) {
      entity.draftMode = {
        enabled: entityDecision.draftMode.enabled === true,
        processField: entityDecision.draftMode.processField || 'documentAction',
        processValue: entityDecision.draftMode.processValue || 'CO',
        label: entityDecision.draftMode.label || 'Process',
      };
    }

    if (entityDecision.formCols != null) {
      entity.formCols = entityDecision.formCols;
    }

    curatedEntities.push(entity);
  }

  const windowDecisions = decisions.window || {};
  const rawWindow = schemaRaw.window || {};

  const schema = {
    version: '0.1.0',
    window: {
      id: rawWindow.id,
      name: windowDecisions.name || rawWindow.name,
      primaryEntity: curatedEntities[0]?.name || null,
      category: windowDecisions.category || inferCategory(rawWindow.name),
    },
    entities: curatedEntities,
  };

  // Only include layoutType/templateConfig if set
  if (windowDecisions.layoutType) {
    schema.window.layoutType = windowDecisions.layoutType;
  }
  if (windowDecisions.sidebarLayout) {
    schema.window.sidebarLayout = windowDecisions.sidebarLayout;
  }
  if (windowDecisions.templateConfig) {
    schema.window.templateConfig = windowDecisions.templateConfig;
  }
  // Pass through optional window-level UI config from decisions
  if (windowDecisions.documentPreview) {
    schema.window.documentPreview = windowDecisions.documentPreview;
  }
  if (windowDecisions.notesField) {
    schema.window.notesField = windowDecisions.notesField;
  }
  if (windowDecisions.relatedDocuments) {
    schema.window.relatedDocuments = windowDecisions.relatedDocuments;
  }
  if (windowDecisions.hideDeleteWhenComplete) {
    schema.window.hideDeleteWhenComplete = true;
  }
  if (windowDecisions.hidePrint) {
    schema.window.hidePrint = true;
  }
  if (windowDecisions.breadcrumb !== undefined) {
    schema.window.breadcrumb = windowDecisions.breadcrumb;
  }
  if (windowDecisions.customComponents) {
    schema.window.customComponents = windowDecisions.customComponents;
  }
  if (windowDecisions.menuActions) {
    schema.window.menuActions = windowDecisions.menuActions;
  }
  if (windowDecisions.processOverrides) {
    schema.window.processOverrides = windowDecisions.processOverrides;
  }
  // Forward secondary tab config and label overrides from decisions
  if (windowDecisions.entityLabel) {
    schema.window.entityLabel = windowDecisions.entityLabel;
  }
  if (windowDecisions.detailLabel) {
    schema.window.detailLabel = windowDecisions.detailLabel;
  }
  if (windowDecisions.detailTabIndex != null) {
    schema.window.detailTabIndex = windowDecisions.detailTabIndex;
  }
  if (windowDecisions.secondaryTabs) {
    schema.window.secondaryTabs = windowDecisions.secondaryTabs;
  }
  if ('detailEntity' in windowDecisions) {
    schema.window.detailEntity = windowDecisions.detailEntity;
  }
  if (windowDecisions.statusBar) {
    schema.window.statusBar = windowDecisions.statusBar;
  }
  if (windowDecisions.statusField) {
    schema.window.statusField = windowDecisions.statusField;
  }
  if (Array.isArray(windowDecisions.summaryFields)) {
    schema.window.summaryFields = windowDecisions.summaryFields;
  }
  if (windowDecisions.detailSortBy) {
    schema.window.detailSortBy = windowDecisions.detailSortBy;
  }
  if (windowDecisions.salesTheme != null) {
    schema.window.salesTheme = windowDecisions.salesTheme;
  }
  if (windowDecisions.listKpiCards) {
    schema.window.listKpiCards = windowDecisions.listKpiCards;
  }
  if (windowDecisions.headerExtra) {
    schema.window.headerExtra = windowDecisions.headerExtra;
  }
  if (windowDecisions.primaryTabs) {
    schema.window.primaryTabs = windowDecisions.primaryTabs;
  }
  if (windowDecisions.othersLabel) {
    schema.window.othersLabel = windowDecisions.othersLabel;
  }

  const rules = resolveRules(rulesRaw, decisions);

  return { schema, rules };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function runCli() {
  const args = process.argv.slice(2);
  const windowIdx = args.indexOf('--window');
  const dump = args.includes('--dump');

  if (windowIdx === -1 || !args[windowIdx + 1]) {
    console.error('Usage: node cli/src/resolve-curated.js --window <window-name> [--dump]');
    process.exit(1);
  }

  const windowName = args[windowIdx + 1];
  const artifactsDir = join(ROOT, 'artifacts', windowName);

  const [schemaRaw, rulesRaw] = await Promise.all([
    readFile(join(artifactsDir, 'schema-raw.json'), 'utf-8').then(JSON.parse),
    readFile(join(artifactsDir, 'rules-raw.json'), 'utf-8').then(JSON.parse),
  ]);

  let decisions = {};
  const decisionsPath = join(artifactsDir, 'decisions.json');
  try {
    decisions = await readFile(decisionsPath, 'utf-8').then(JSON.parse);

    // Auto-migrate and persist if needed
    if (needsMigration(decisions)) {
      const result = migrateDecisions(decisions, { schemaRaw });
      decisions = result.decisions;
      await writeFile(decisionsPath, JSON.stringify(decisions, null, 2) + '\n', 'utf-8');
      console.log(`decisions.json auto-migrated: v${result.fromVersion} → v${result.toVersion}`);
    }
  } catch {
    console.warn('No decisions.json found — using empty decisions (all defaults).');
  }

  const { schema, rules } = await resolveCurated(schemaRaw, rulesRaw, decisions);

  if (dump) {
    console.log('--- schema ---');
    console.log(JSON.stringify(schema, null, 2));
    console.log('--- rules ---');
    console.log(JSON.stringify(rules, null, 2));
  } else {
    console.log(`Resolved ${schema.entities.length} entities:`);
    for (const e of schema.entities) {
      const visible = e.fields.filter(f => f.visibility !== 'system' && f.visibility !== 'discarded').length;
      console.log(`  ${e.name}: ${e.fields.length} fields (${visible} visible)`);
    }
    console.log(`Rules: ${rules.length}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
