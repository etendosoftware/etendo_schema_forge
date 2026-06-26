#!/usr/bin/env node

/**
 * push-to-neo.js — Configure NEO Headless via direct DB writes from contract + schema artifacts.
 *
 * Reads contract.json and schema-curated.json for a given window, then writes
 * configuration directly to the ETGO_SF_* tables via PostgreSQL.
 *
 * Usage:
 *   node cli/src/push-to-neo.js <windowName>
 *   node cli/src/push-to-neo.js sales-order
 *   node cli/src/push-to-neo.js sales-order --dry-run
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDbPool, closePool } from './db.js';
import {
  upsertSpec as writerUpsertSpec,
  populateSpec as writerPopulateSpec,
  upsertField as writerUpsertField,
} from './neo-writer.js';
import { computeWindowDelta, serializeDelta } from './lib/neo-delta.js';
import { loadEtgoXmlSnapshot } from './lib/etgo-xml-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = process.env.SF_ROOT || join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Convert a window display name to kebab-case spec name.
 * "Sales Order" -> "sales-order", "Business Partner" -> "business-partner"
 */
export function toSpecName(windowName) {
  return windowName
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // split camelCase
    .replace(/[^a-zA-Z0-9]+/g, '-')          // non-alphanum -> dash
    .replace(/(^-)|(-$)/g, '')                // trim leading/trailing dashes
    .toLowerCase();
}

/**
 * Map a field visibility value to NEO params.
 * Returns { isIncluded: "Y"|"N", isReadOnly: "Y"|"N" }.
 */
export function mapVisibility(visibility) {
  switch (visibility) {
    case 'editable':
      return { isIncluded: 'Y', isReadOnly: 'N' };
    case 'readOnly':
      return { isIncluded: 'Y', isReadOnly: 'Y' };
    case 'system':
      return { isIncluded: 'Y', isReadOnly: 'Y' };
    case 'discarded':
      return { isIncluded: 'N', isReadOnly: 'N' };
    default:
      return { isIncluded: 'N', isReadOnly: 'N' };
  }
}

/**
 * Build the full webhook URL from a base Etendo URL and webhook name.
 * @deprecated Use direct DB writes via neo-writer.js instead.
 */
export function buildWebhookUrl(etendoUrl, webhookName) {
  const base = etendoUrl.replace(/\/+$/, '');
  return `${base}/sws/webhooks/${webhookName}`;
}

/**
 * Extract all fields from all entities in a backend contract.
 * Returns an array of { entityName, fieldName, column, visibility }.
 */
export function extractFieldsFromContract(backendContract) {
  const fields = [];
  for (const [entityName, entityData] of Object.entries(backendContract.entities)) {
    for (const field of entityData.fields) {
      fields.push({
        entityName,
        tabId: entityData.tabId || null,
        tableName: entityData.tableName || null,
        fieldName: field.name,
        column: field.column,
        visibility: field.visibility,
        businessCritical: field.businessCritical || false,
      });
    }
  }
  return fields;
}

export function normalizeAgentPrompt(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

// ---------------------------------------------------------------------------
// Configuration loading
// ---------------------------------------------------------------------------

/**
 * Parse a simple .properties file (key=value lines, # comments).
 */
function parseProperties(content) {
  const props = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    props[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return props;
}

/**
 * Load Etendo connection config from env vars or schema_forge.properties.
 * Env vars take precedence.
 * @deprecated HTTP config is no longer needed for live mode. DB config comes from db.js.
 *             Kept for backwards compatibility with dry-run display and existing tests.
 */
export async function loadConfig(projectRoot) {
  const env = process.env;
  let fileProps = {};

  try {
    const raw = await readFile(join(projectRoot, 'schema_forge.properties'), 'utf-8');
    fileProps = parseProperties(raw);
  } catch {
    // Properties file is optional if env vars are set
  }

  const url = env.ETENDO_URL || fileProps['etendo.url'];
  const user = env.ETENDO_USER || fileProps['etendo.user'];
  const password = env.ETENDO_PASSWORD || fileProps['etendo.password'];

  if (!url) throw new Error('Missing Etendo URL. Set ETENDO_URL env var or etendo.url in schema_forge.properties.');
  if (!user) throw new Error('Missing Etendo user. Set ETENDO_USER env var or etendo.user in schema_forge.properties.');
  if (!password) throw new Error('Missing Etendo password. Set ETENDO_PASSWORD env var or etendo.password in schema_forge.properties.');

  return { url, user, password };
}

// com.etendoerp.go — the module that owns the NEO Headless config.
const GO_MODULE_ID = '94E1B433CF55451EABB764750AC5902A';

/**
 * Mark com.etendoerp.go as "in development" so AD changes can be applied.
 * Idempotent — only updates if the flag is not already 'Y'.
 */
async function setGoModuleInDevelopment(client) {
  const res = await client.query(
    `UPDATE ad_module
     SET isindevelopment = 'Y', updated = now()
     WHERE ad_module_id = $1 AND COALESCE(isindevelopment, 'N') <> 'Y'`,
    [GO_MODULE_ID],
  );
  if (res.rowCount > 0) {
    console.log(`       Module com.etendoerp.go marked as 'In Development'.`);
  }
}

/**
 * Detect duplicate (entity_id, ad_column_id) rows in etgo_sf_field for a given spec.
 *
 * Duplicates make `populateSpec` and the field lookup in pushToNeo non-deterministic:
 * each run picks a different row to update, producing a Y/N flip on every push and
 * a noisy diff in `src-db/database/sourcedata/ETGO_SF_FIELD.xml`.
 *
 * Scoped to the spec being pushed so unrelated dirty data does not block the work.
 * Returns an array of `{ entityName, columnName, fieldIds[] }` — empty if clean.
 *
 * @param {import('pg').PoolClient} client
 * @param {string} specName
 */
export async function checkDuplicateFields(client, specName) {
  const res = await client.query(
    `SELECT e.name AS entity_name,
            c.columnname AS column_name,
            ARRAY_AGG(f.etgo_sf_field_id ORDER BY f.created, f.etgo_sf_field_id) AS field_ids
       FROM etgo_sf_field f
       JOIN etgo_sf_entity e ON e.etgo_sf_entity_id = f.etgo_sf_entity_id
       JOIN etgo_sf_spec   s ON s.etgo_sf_spec_id   = e.etgo_sf_spec_id
       JOIN ad_column      c ON c.ad_column_id      = f.ad_column_id
      WHERE s.name = $1
      GROUP BY e.name, c.columnname
     HAVING COUNT(*) > 1
      ORDER BY e.name, c.columnname`,
    [specName],
  );
  return res.rows.map(r => ({
    entityName: r.entity_name,
    columnName: r.column_name,
    fieldIds: r.field_ids,
  }));
}

/**
 * Format duplicates as a human-readable error message for fail-fast reporting.
 *
 * fieldIds inside each duplicate are sorted (oldest first) by checkDuplicateFields,
 * so the first ID is the suggested "keep" and the rest are the suggested "delete".
 * push-to-neo will UPDATE the surviving row in the next run.
 */
export function formatDuplicateFieldsError(specName, duplicates) {
  const idsToDelete = [];
  const lines = [
    `Duplicate ETGO_SF_FIELD rows detected for spec '${specName}'.`,
    `Push aborted — keep ONE row per (entity, column) and delete the rest, then retry.`,
    ``,
  ];
  for (const d of duplicates) {
    lines.push(`  - entity='${d.entityName}' column='${d.columnName}'`);
    const [keepId, ...dropIds] = d.fieldIds;
    lines.push(`      keep:    ${keepId}`);
    for (const id of dropIds) {
      lines.push(`      delete:  ${id}`);
      idsToDelete.push(id);
    }
  }
  lines.push(``);
  lines.push(`Suggested SQL (review before running — adjust which row to keep if needed):`);
  lines.push(`  DELETE FROM etgo_sf_field WHERE etgo_sf_field_id IN (`);
  lines.push(idsToDelete.map(id => `    '${id}'`).join(',\n'));
  lines.push(`  );`);
  lines.push(``);
  lines.push(`The surviving row will be updated by the next \`make regen ONLY=${specName} PUSH_TO_NEO=1\`.`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main push function
// ---------------------------------------------------------------------------

/**
 * Push a window's contract configuration to NEO Headless via direct DB writes.
 *
 * @param {string} windowName - The window artifact folder name (e.g., "sales-order")
 * @param {object} [options] - Override options
 * @param {boolean} [options.dryRun] - If true, log planned actions without writing to DB
 * @param {string} [options.projectRoot] - Override project root path
 * @param {string} [options.moduleId='94E1B433CF55451EABB764750AC5902A'] - AD_Module_ID for new rows (defaults to com.etendoerp.go)
 * @param {object} [options.dbConfig] - Override DB pool config (passed to createDbPool)
 * @param {object} [options.audit] - Override audit defaults
 * @param {string} [options.etendoUrl] - Kept for backwards compat (dry-run plan display)
 * @param {string} [options.user] - Kept for backwards compat
 * @param {string} [options.password] - Kept for backwards compat
 * @returns {object} Result summary with spec, entities, and field updates
 */
export async function pushToNeo(windowName, options = {}) {
  const projectRoot = options.projectRoot || ROOT;
  const artifactsDir = join(projectRoot, 'artifacts', windowName);

  const { contract, schemaRawData, decisionsData } = await loadPushArtifacts(artifactsDir, windowName);
  const windowId = resolveWindowId(schemaRawData, contract, options);
  const windowDisplayName = schemaRawData.window.name;
  const specName = windowName;
  const fieldDefaultExprs = buildFieldDefaultExprMap(decisionsData);
  const fieldAgentPrompts = buildFieldAgentPromptMap(decisionsData);
  const specAgentPrompt = normalizeAgentPrompt(decisionsData.window?.agentPrompt);
  const allFields = extractFieldsFromContract(contract.backendContract);

  if (options.dryRun === true) {
    return reportDryRunPlan({ allFields, specName, windowId, windowDisplayName, windowName });
  }

  return executePushTransaction({
    contract,
    schemaRawData,
    allFields,
    fieldDefaultExprs,
    fieldAgentPrompts,
    specAgentPrompt,
    specName,
    windowId,
    moduleId: options.moduleId || '94E1B433CF55451EABB764750AC5902A',
    auditOpts: options.audit || {},
    dbConfig: options.dbConfig,
  });
}

// ---------------------------------------------------------------------------
// pushToNeo helpers (private)
// ---------------------------------------------------------------------------

async function loadPushArtifacts(artifactsDir, windowName) {
  let contractRaw, schemaRawJson;
  try {
    contractRaw = await readFile(join(artifactsDir, 'contract.json'), 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read contract.json for window '${windowName}': ${err.message}`);
  }
  try {
    schemaRawJson = await readFile(join(artifactsDir, 'schema-raw.json'), 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read schema-raw.json for window '${windowName}': ${err.message}`);
  }
  let decisionsData = {};
  try {
    const decisionsRaw = await readFile(join(artifactsDir, 'decisions.json'), 'utf-8');
    decisionsData = JSON.parse(decisionsRaw);
  } catch { /* optional — not all windows have decisions.json */ }
  return {
    contract: JSON.parse(contractRaw),
    schemaRawData: JSON.parse(schemaRawJson),
    decisionsData,
  };
}

function resolveWindowId(schemaRawData, contract, options) {
  if (options.overrideWindow) return options.overrideWindow;
  if (contract.backendContract?.window?.id) return contract.backendContract.window.id;
  return schemaRawData.window.id;
}

function buildFieldDefaultExprMap(decisionsData) {
  const map = {};
  for (const [entityKey, entityConf] of Object.entries(decisionsData.entities || {})) {
    const entityName = entityConf.name || entityKey;
    for (const [fieldName, fieldConf] of Object.entries(entityConf.fields || {})) {
      if (fieldConf.defaultExpr != null) {
        map[`${entityName}.${fieldName}`] = fieldConf.defaultExpr;
      }
    }
  }
  return map;
}

/**
 * Build a `entityName.fieldName` -> agentPrompt map from decisions.json.
 * Mirrors buildFieldDefaultExprMap so the per-field agent guidance flows to
 * neo_schema the same way default expressions flow to the contract.
 */
export function buildFieldAgentPromptMap(decisionsData) {
  const map = {};
  for (const [entityKey, entityConf] of Object.entries(decisionsData.entities || {})) {
    const entityName = entityConf.name || entityKey;
    for (const [fieldName, fieldConf] of Object.entries(entityConf.fields || {})) {
      if (Object.hasOwn(fieldConf, 'agentPrompt')) {
        map[`${entityName}.${fieldName}`] = normalizeAgentPrompt(fieldConf.agentPrompt);
      }
    }
  }
  return map;
}

export function buildSpecUpsertParams(ctx, existingSpecId) {
  return {
    name: ctx.specName,
    moduleId: ctx.moduleId,
    windowId: ctx.windowId,
    specType: 'W',
    specId: existingSpecId,
    agentPrompt: ctx.specAgentPrompt ?? null,
    audit: ctx.auditOpts,
  };
}

export function buildFieldUpdateParams(f, ctx, fieldId, entityId) {
  const vis = mapVisibility(f.visibility);
  const fieldKey = `${f.entityName}.${f.fieldName}`;
  const fieldParams = {
    entityId,
    fieldId,
    moduleId: ctx.moduleId,
    isIncluded: vis.isIncluded,
    isReadOnly: vis.isReadOnly,
    isBusinessCritical: f.businessCritical ? 'Y' : 'N',
    audit: ctx.auditOpts,
  };
  if (fieldKey in ctx.fieldDefaultExprs) {
    fieldParams.defaultValue = ctx.fieldDefaultExprs[fieldKey] || null;
  }
  if (ctx.fieldAgentPrompts) {
    fieldParams.agentPrompt = fieldKey in ctx.fieldAgentPrompts
      ? ctx.fieldAgentPrompts[fieldKey]
      : null;
  }
  // When the camelCase field key differs from the AD column name (e.g.
  // "documentAction" vs "DocAction"), store the key as java_qualifier so
  // NeoButtonActionHelper.findButtonColumn can match it by URL segment.
  if (f.fieldName && f.fieldName !== f.column) {
    fieldParams.javaQualifier = f.fieldName;
  }
  return fieldParams;
}

function reportDryRunPlan({ allFields, specName, windowId, windowDisplayName, windowName }) {
  const plan = {
    spec: { action: 'upsertSpec', params: { windowId, name: specName, specType: 'W' } },
    populate: { action: 'populateSpec', params: { specId: '(from step 1)' } },
    fields: allFields.map(f => {
      const vis = mapVisibility(f.visibility);
      return {
        action: 'upsertField',
        entityName: f.entityName,
        params: { entityId: '(from populate)', column: f.column, isIncluded: vis.isIncluded, isReadOnly: vis.isReadOnly },
      };
    }),
  };

  console.log(`[DRY RUN] Push to NEO for window: ${windowDisplayName} (${windowName})`);
  console.log(`  Spec name: ${specName}`);
  console.log(`  Window ID: ${windowId}`);
  console.log(`  Method: direct DB write`);
  console.log(`\n  Step 1: upsertSpec`);
  console.log(`    Params:`, plan.spec.params);
  console.log(`\n  Step 2: populateSpec`);
  console.log(`    Params: { specId: <returned from step 1> }`);
  console.log(`\n  Step 3: ${plan.fields.length} field updates via upsertField`);

  const included = plan.fields.filter(f => f.params.isIncluded === 'Y');
  const excluded = plan.fields.filter(f => f.params.isIncluded === 'N');
  const readOnly = plan.fields.filter(f => f.params.isReadOnly === 'Y');
  console.log(`    Included: ${included.length}, Excluded: ${excluded.length}, ReadOnly: ${readOnly.length}`);

  return {
    dryRun: true,
    specName,
    windowId,
    plan,
    summary: {
      totalFields: allFields.length,
      included: included.length,
      excluded: excluded.length,
      readOnly: readOnly.length,
    },
  };
}

async function executePushTransaction(ctx) {
  const pool = createDbPool(ctx.dbConfig);
  const client = await pool.connect();
  try {
    const duplicates = await checkDuplicateFields(client, ctx.specName);
    if (duplicates.length > 0) {
      throw new Error(formatDuplicateFieldsError(ctx.specName, duplicates));
    }

    await client.query('BEGIN');
    await setGoModuleInDevelopment(client);

    const specId = await stepUpsertSpec(client, ctx);
    const popResult = await stepPopulateSpec(client, { ...ctx, specId });
    const entityMaps = await buildEntityLookupMaps(client, popResult, specId, ctx.schemaRawData);
    await renameEntitiesToContractNames(client, ctx, entityMaps);

    const { successCount, errorCount, fieldResults } =
      await stepUpdateFieldVisibility(client, ctx, entityMaps);

    const excludedCount = await stepExcludeNonContractFields(client, popResult, ctx.allFields, ctx.schemaRawData);

    await client.query('COMMIT');

    console.log(`\nDone. ${successCount} fields updated, ${errorCount} errors, ${excludedCount} excluded.`);
    return {
      dryRun: false,
      specName: ctx.specName,
      specId,
      windowId: ctx.windowId,
      entitiesPopulated: popResult.entityCount,
      fieldsUpdated: successCount,
      fieldsErrored: errorCount,
      fieldsExcluded: excludedCount,
      fieldResults,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await closePool(pool);
  }
}

async function stepUpsertSpec(client, ctx) {
  const existingSpec = await client.query(
    'SELECT etgo_sf_spec_id FROM etgo_sf_spec WHERE name = $1',
    [ctx.specName],
  );
  const existingSpecId = existingSpec.rows.length > 0 ? existingSpec.rows[0].etgo_sf_spec_id : null;
  console.log(`[1/4] Upserting spec '${ctx.specName}' for window ${ctx.windowId}...`);
  const specResult = await writerUpsertSpec(client, buildSpecUpsertParams(ctx, existingSpecId));
  console.log(`       Spec ID: ${specResult.specId} (${specResult.created ? 'created' : 'updated'})`);
  return specResult.specId;
}

async function stepPopulateSpec(client, { specId, moduleId, auditOpts }) {
  console.log(`[2/4] Populating spec from AD metadata...`);
  const popResult = await writerPopulateSpec(client, {
    specId,
    moduleId,
    includeAllMethods: true,
    audit: auditOpts,
  });
  console.log(`       Entities populated: ${popResult.entityCount}, Fields: ${popResult.fieldCount}`);
  return popResult;
}

async function buildEntityLookupMaps(client, popResult, specId, schemaRawData) {
  const entityMapByTabId = {};
  const entityMapByName = {};
  const entityMapByTableName = {};
  for (const ent of popResult.entities) {
    if (ent.tabId) entityMapByTabId[ent.tabId] = ent.entityId;
    entityMapByName[ent.name] = ent.entityId;
  }
  if (popResult.entities.length > 0) {
    // tab.seqno can repeat when multiple modules attach tabs to the same
    // window. The first row wins in entityMapByTableName below, so without a
    // tiebreaker the winning entity flips across runs.
    const tableNameQuery = await client.query(
      `SELECT e.etgo_sf_entity_id, t.tablename, tab.seqno
       FROM etgo_sf_entity e
       JOIN ad_tab tab ON tab.ad_tab_id = e.ad_tab_id
       JOIN ad_table t ON t.ad_table_id = tab.ad_table_id
       WHERE e.etgo_sf_spec_id = $1
       ORDER BY tab.seqno, t.tablename, tab.ad_tab_id`,
      [specId],
    );
    for (const row of tableNameQuery.rows) {
      if (!entityMapByTableName[row.tablename]) {
        entityMapByTableName[row.tablename] = row.etgo_sf_entity_id;
      }
    }
  }
  const curatedToTable = {};
  for (const ent of (schemaRawData.entities || [])) {
    if (ent.name && ent.tableName) curatedToTable[ent.name] = ent.tableName;
  }
  return { entityMapByTabId, entityMapByName, entityMapByTableName, curatedToTable };
}

function buildDesiredEntitiesMap(schemaRawData, contract) {
  const schemaEntities = (schemaRawData.entities || []).map((ent) => ({
    name: ent.name,
    tabName: ent.tabName,
    tableName: ent.tableName,
  }));
  const desired = new Map(
    schemaEntities
      .filter((ent) => ent.tabName || ent.tableName)
      .map((ent) => [ent.tabName || ent.tableName, { ...ent, javaQualifier: undefined }]),
  );
  if (!contract.backendContract?.entities) return desired;
  for (const [name, data] of Object.entries(contract.backendContract.entities)) {
    const schemaFallback = schemaEntities.find((ent) =>
      ent.name === name
      || (data.tabName && ent.tabName === data.tabName)
      || (data.tableName && ent.tableName === data.tableName)
    );
    const tabOrTableKey = data.tabName || schemaFallback?.tabName || data.tableName || schemaFallback?.tableName;
    if (!tabOrTableKey) continue;
    desired.set(tabOrTableKey, {
      name,
      tabName: data.tabName || schemaFallback?.tabName || null,
      tableName: data.tableName || schemaFallback?.tableName || null,
      javaQualifier: data.javaQualifier ?? undefined,
    });
  }
  return desired;
}

async function renameEntitiesToContractNames(client, ctx, entityMaps) {
  const desiredEntities = buildDesiredEntitiesMap(ctx.schemaRawData, ctx.contract);
  if (desiredEntities.size === 0) return;
  for (const ent of desiredEntities.values()) {
    const entityId = (ent.tabName && entityMaps.entityMapByName[ent.tabName])
      || (ent.tableName && entityMaps.entityMapByTableName[ent.tableName]);
    if (!entityId) continue;
    if (ent.javaQualifier !== undefined) {
      await client.query(
        'UPDATE etgo_sf_entity SET name = $1, java_qualifier = $2 WHERE etgo_sf_entity_id = $3',
        [ent.name, ent.javaQualifier, entityId],
      );
    } else {
      await client.query(
        'UPDATE etgo_sf_entity SET name = $1 WHERE etgo_sf_entity_id = $2',
        [ent.name, entityId],
      );
    }
    entityMaps.entityMapByName[ent.name] = entityId;
  }
  console.log('       Entity names updated to contract names');
}

function resolveEntityIdForField(f, entityMaps) {
  const tableForEntity = f.tableName || entityMaps.curatedToTable[f.entityName];
  return (f.tabId && entityMaps.entityMapByTabId[f.tabId])
    || entityMaps.entityMapByName[f.entityName]
    || (tableForEntity && entityMaps.entityMapByTableName[tableForEntity]);
}

async function stepUpdateFieldVisibility(client, ctx, entityMaps) {
  console.log(`[3/4] Updating ${ctx.allFields.length} fields from contract visibility...`);
  let successCount = 0;
  let errorCount = 0;
  const fieldResults = [];
  for (const f of ctx.allFields) {
    const result = await upsertSingleField(client, f, ctx, entityMaps);
    fieldResults.push(result);
    if (result.success) successCount++; else errorCount++;
  }
  return { successCount, errorCount, fieldResults };
}

async function upsertSingleField(client, f, ctx, entityMaps) {
  const entityId = resolveEntityIdForField(f, entityMaps);
  if (!entityId) {
    console.warn(`  Warning: No entity ID found for '${f.entityName}', skipping field '${f.column}'`);
    return { column: f.column, entityName: f.entityName, success: false, error: 'no entity' };
  }
  const colLookup = await client.query(
    `SELECT sf.etgo_sf_field_id
     FROM etgo_sf_field sf
     JOIN ad_column c ON c.ad_column_id = sf.ad_column_id
     WHERE sf.etgo_sf_entity_id = $1 AND c.columnname = $2
     ORDER BY sf.created, sf.etgo_sf_field_id`,
    [entityId, f.column],
  );
  if (colLookup.rows.length === 0) {
    return { column: f.column, entityName: f.entityName, success: true, skipped: true };
  }
  const fieldParams = buildFieldUpdateParams(
    f,
    ctx,
    colLookup.rows[0].etgo_sf_field_id,
    entityId,
  );
  await writerUpsertField(client, fieldParams);
  return { column: f.column, entityName: f.entityName, success: true };
}

export async function stepExcludeNonContractFields(client, popResult, allFields, schemaRawData) {
  console.log(`[4/4] Excluding non-contract fields...`);
  const contractColumns = new Set(allFields.map(f => f.column));
  // Only exclude columns that were extracted from AD in this run.
  // Columns belonging to uninstalled extension modules won't appear in
  // schemaRawData — leaving their isIncluded state untouched prevents the
  // pipeline from toggling fields from modules not present in the current env.
  const extractedColumns = new Set();
  for (const ent of (schemaRawData?.entities ?? [])) {
    for (const field of (ent.fields ?? [])) {
      if (field.columnName) extractedColumns.add(field.columnName);
    }
  }
  let excludedCount = 0;
  for (const ent of popResult.entities) {
    const allEntityFields = await client.query(
      `SELECT sf.etgo_sf_field_id, c.columnname
       FROM etgo_sf_field sf
       JOIN ad_column c ON c.ad_column_id = sf.ad_column_id
       WHERE sf.etgo_sf_entity_id = $1 AND sf.isincluded = 'Y'`,
      [ent.entityId],
    );
    for (const row of allEntityFields.rows) {
      if (!contractColumns.has(row.columnname) && extractedColumns.has(row.columnname)) {
        await client.query(
          `UPDATE etgo_sf_field SET isincluded = 'N', updated = now() WHERE etgo_sf_field_id = $1`,
          [row.etgo_sf_field_id],
        );
        excludedCount++;
      }
    }
  }
  console.log(`       ${excludedCount} non-contract fields excluded.`);
  return excludedCount;
}

// ---------------------------------------------------------------------------
// Process push function
// ---------------------------------------------------------------------------

/**
 * Push a process contract configuration to NEO Headless via direct DB writes.
 *
 * @param {string} processName - The process artifact folder name (e.g., "generate-invoices")
 * @param {object} [options] - Override options
 * @param {boolean} [options.dryRun] - If true, log planned actions without writing to DB
 * @param {string} [options.projectRoot] - Override project root path
 * @param {string} [options.moduleId='94E1B433CF55451EABB764750AC5902A'] - AD_Module_ID for new rows (defaults to com.etendoerp.go)
 * @param {object} [options.dbConfig] - Override DB pool config
 * @param {object} [options.audit] - Override audit defaults
 * @param {string} [options.specType='P'] - Spec type: 'P' (process) or 'R' (report)
 * @returns {object} Result summary
 */
export async function pushProcessToNeo(processName, options = {}) {
  const projectRoot = options.projectRoot || ROOT;
  const artifactsDir = join(projectRoot, 'artifacts', processName);

  // Load process contract
  let contractRaw;
  try {
    contractRaw = await readFile(join(artifactsDir, 'contract.json'), 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read contract.json for process '${processName}': ${err.message}`);
  }

  const contract = JSON.parse(contractRaw);

  if (contract.type !== 'process') {
    throw new Error(`Contract type is '${contract.type}', expected 'process'`);
  }

  const processId = contract.process.id;
  const specName = contract.process.specName;
  const processDisplayName = contract.process.name;
  const specType = options.specType || 'P';

  // Dry run mode
  if (options.dryRun === true) {
    const typeLabel = specType === 'R' ? 'report' : 'process';
    console.log(`[DRY RUN] Push to NEO for ${typeLabel}: ${processDisplayName} (${processName})`);
    console.log(`  Spec name: ${specName}`);
    console.log(`  Process ID: ${processId}`);
    console.log(`  Spec type: ${specType}`);
    console.log(`  Method: direct DB write`);
    console.log(`\n  Step 1: upsertSpec (specType=${specType})`);
    console.log(`    Params: { name: '${specName}', specType: '${specType}', processId: '${processId}' }`);
    console.log(`\n  Step 2: populateSpec (auto-creates entity + fields from AD_Process_Para)`);
    console.log(`    Params: { specId: <from step 1> }`);

    return {
      dryRun: true,
      specName,
      processId,
      plan: {
        spec: { action: 'upsertSpec', params: { name: specName, specType, processId } },
        populate: { action: 'populateSpec', params: { specId: '(from step 1)' } },
      },
    };
  }

  // Live mode — write to DB via transaction
  const moduleId = options.moduleId || '94E1B433CF55451EABB764750AC5902A';
  const auditOpts = options.audit || {};
  const pool = createDbPool(options.dbConfig);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setGoModuleInDevelopment(client);

    // Step 1: Upsert spec (look up existing spec first for idempotent updates)
    const existingSpec = await client.query(
      'SELECT etgo_sf_spec_id FROM etgo_sf_spec WHERE name = $1',
      [specName],
    );
    const existingSpecId = existingSpec.rows.length > 0
      ? existingSpec.rows[0].etgo_sf_spec_id
      : null;
    console.log(`[1/2] Upserting spec '${specName}' for process ${processId}...`);
    const specResult = await writerUpsertSpec(client, {
      name: specName,
      moduleId,
      processId,
      specType,
      specId: existingSpecId,
      audit: auditOpts,
    });
    const specId = specResult.specId;
    console.log(`       Spec ID: ${specId} (${specResult.created ? 'created' : 'updated'})`);

    // Step 2: Populate spec from AD metadata (creates entity + fields automatically)
    console.log(`[2/2] Populating spec from AD_Process_Para...`);
    const popResult = await writerPopulateSpec(client, {
      specId,
      moduleId,
      audit: auditOpts,
    });
    console.log(`       Entity: ${popResult.entities[0]?.name || 'unnamed'}, Fields: ${popResult.fieldCount}`);

    await client.query('COMMIT');

    console.log(`\nDone. Process spec '${specName}' configured.`);

    return {
      dryRun: false,
      specName,
      specId,
      processId,
      entityCount: popResult.entityCount,
      fieldCount: popResult.fieldCount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await closePool(pool);
  }
}

// ---------------------------------------------------------------------------
// Report push function (NeoHandler-based reports)
// ---------------------------------------------------------------------------

/**
 * Push a report's configuration to NEO Headless.
 * Creates a spec (type R) and an entity with the NeoHandler java_qualifier.
 *
 * Uses report-contract.json from the artifact directory.
 * The handler class must be compiled and deployed in the Etendo module.
 *
 * @param {string} reportName - The report artifact folder name (e.g., "aging-receivable")
 * @param {object} [options] - Override options
 * @param {boolean} [options.dryRun] - If true, log planned actions without writing to DB
 * @param {string} [options.projectRoot] - Override project root path
 * @param {string} [options.moduleId='94E1B433CF55451EABB764750AC5902A'] - AD_Module_ID
 * @param {object} [options.dbConfig] - Override DB pool config
 * @param {object} [options.audit] - Override audit defaults
 * @returns {object} Result summary
 */
export async function pushReportToNeo(reportName, options = {}) {
  const projectRoot = options.projectRoot || ROOT;
  const artifactsDir = join(projectRoot, 'artifacts', reportName);

  // Load report contract
  let contractRaw;
  try {
    contractRaw = await readFile(join(artifactsDir, 'report-contract.json'), 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read report-contract.json for '${reportName}': ${err.message}`);
  }

  const contract = JSON.parse(contractRaw);
  const specName = contract.reportId || reportName;
  const handler = contract.neo?.handler || null;
  const title = contract.title?.en_US || specName;
  const description = `Report: ${title}`;

  // Resolve process ID if referenced in jasper config
  const processId = contract.jasper?.processId || null;

  if (options.dryRun === true) {
    console.log(`[DRY RUN] Push report to NEO: ${title} (${specName})`);
    console.log(`  Spec name: ${specName}`);
    console.log(`  Spec type: R (report)`);
    console.log(`  Process ID: ${processId || '(none)'}`);
    console.log(`  NeoHandler: ${handler || '(none)'}`);
    console.log(`  Method: direct DB write`);
    console.log(`\n  Step 1: upsertSpec (specType=R)`);
    console.log(`  Step 2: create entity with java_qualifier='${handler}'`);
    return { dryRun: true, specName, handler };
  }

  // Live mode
  const moduleId = options.moduleId || '94E1B433CF55451EABB764750AC5902A';
  const auditOpts = options.audit || {};
  const pool = createDbPool(options.dbConfig);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setGoModuleInDevelopment(client);

    // Step 1: Upsert spec
    const existingSpec = await client.query(
      'SELECT etgo_sf_spec_id FROM etgo_sf_spec WHERE name = $1',
      [specName],
    );
    const existingSpecId = existingSpec.rows.length > 0
      ? existingSpec.rows[0].etgo_sf_spec_id
      : null;

    console.log(`[1/2] Upserting spec '${specName}' (type=R)...`);
    const specResult = await writerUpsertSpec(client, {
      name: specName,
      moduleId,
      processId,
      specType: 'R',
      description,
      specId: existingSpecId,
      audit: auditOpts,
    });
    const specId = specResult.specId;
    console.log(`       Spec ID: ${specId} (${specResult.created ? 'created' : 'updated'})`);

    // Step 2: Create/update the entity with the handler qualifier
    if (handler) {
      const existingEntity = await client.query(
        'SELECT etgo_sf_entity_id FROM etgo_sf_entity WHERE etgo_sf_spec_id = $1',
        [specId],
      );

      if (existingEntity.rows.length > 0) {
        // Update handler qualifier on existing entity
        const entityId = existingEntity.rows[0].etgo_sf_entity_id;
        await client.query(
          `UPDATE etgo_sf_entity SET java_qualifier = $1, name = $2, updated = now() WHERE etgo_sf_entity_id = $3`,
          [handler, specName, entityId],
        );
        console.log(`[2/2] Updated entity handler: ${handler} (entity ${entityId})`);
      } else {
        // Create a minimal entity for the handler
        const { generateId } = await import('./neo-writer.js');
        const entityId = generateId();
        const auditVals = {
          ad_client_id: auditOpts.ad_client_id || '0',
          ad_org_id: auditOpts.ad_org_id || '0',
          isactive: 'Y',
          created: new Date(),
          createdby: auditOpts.createdby || '0',
          updated: new Date(),
          updatedby: auditOpts.updatedby || '0',
        };
        await client.query(
          `INSERT INTO etgo_sf_entity
           (etgo_sf_entity_id, etgo_sf_spec_id, name, ad_module_id, java_qualifier,
            isget, ispost, isput, ispatch, isdelete, seqno,
            ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby)
           VALUES ($1, $2, $3, $4, $5,
                   'Y', 'Y', 'N', 'N', 'N', 10,
                   $6, $7, $8, $9, $10, $11, $12)`,
          [entityId, specId, specName, moduleId, handler,
           auditVals.ad_client_id, auditVals.ad_org_id, auditVals.isactive,
           auditVals.created, auditVals.createdby, auditVals.updated, auditVals.updatedby],
        );
        console.log(`[2/2] Created entity with handler: ${handler} (entity ${entityId})`);
      }
    } else if (processId) {
      // No handler — populate from AD_Process metadata (standard report flow)
      console.log(`[2/2] Populating spec from AD_Process...`);
      const popResult = await writerPopulateSpec(client, {
        specId,
        moduleId,
        audit: auditOpts,
      });
      console.log(`       Entity: ${popResult.entities[0]?.name || 'unnamed'}, Fields: ${popResult.fieldCount}`);
    } else {
      console.log(`[2/2] No handler or processId — spec-only registration.`);
    }

    await client.query('COMMIT');
    console.log(`\nDone. Report spec '${specName}' configured.`);

    return { dryRun: false, specName, specId, handler };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await closePool(pool);
  }
}

// ---------------------------------------------------------------------------
// Custom window push (no AD backing, NeoHandler-driven)
// ---------------------------------------------------------------------------

/**
 * Push a custom window (no AD_Window backing) to NEO Headless.
 *
 * Reads `decisions.json` from the artifact directory. The entity's
 * `javaQualifier` field drives NeoHandler routing in NEO Headless.
 * No ETGO_SF_FIELD rows are written — the handler owns the data layer.
 *
 * Usage:
 *   node cli/src/push-to-neo.js <windowName> --type custom [--dry-run]
 *
 * @param {string} windowName - Artifact folder name (kebab-case spec name)
 * @param {object} [options]
 * @param {boolean} [options.dryRun]
 * @param {string}  [options.projectRoot]
 * @param {object}  [options.dbConfig]
 * @param {object}  [options.audit]
 */
export async function pushCustomWindowToNeo(windowName, options = {}) {
  const projectRoot = options.projectRoot || ROOT;
  const artifactsDir = join(projectRoot, 'artifacts', windowName);

  let decisions;
  try {
    decisions = JSON.parse(await readFile(join(artifactsDir, 'decisions.json'), 'utf-8'));
  } catch (err) {
    throw new Error(`Cannot read decisions.json for '${windowName}': ${err.message}`);
  }

  const specName = windowName;
  const entityName = 'header';
  const javaQualifier = decisions.entities?.[entityName]?.javaQualifier;

  if (!javaQualifier) {
    throw new Error(
      `decisions.json for '${windowName}' is missing entities.header.javaQualifier`,
    );
  }

  if (options.dryRun) {
    console.log(`[DRY RUN] Push custom window to NEO: ${specName}`);
    console.log(`  Spec name:  ${specName}`);
    console.log(`  Spec type:  W (window)`);
    console.log(`  Qualifier:  ${javaQualifier}`);
    console.log(`\n  Step 1: upsertSpec (specType=W)`);
    console.log(`  Step 2: upsert entity '${entityName}' with java_qualifier='${javaQualifier}'`);
    return { dryRun: true, specName, javaQualifier };
  }

  const auditOpts = options.audit || {};
  const pool = createDbPool(options.dbConfig);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setGoModuleInDevelopment(client);

    // Resolve module ID from DB — never hardcode
    const modRes = await client.query(
      `SELECT ad_module_id FROM ad_module WHERE javapackage = 'com.etendoerp.go'`,
    );
    if (modRes.rows.length === 0) {
      throw new Error("Module 'com.etendoerp.go' not found in ad_module");
    }
    const moduleId = modRes.rows[0].ad_module_id;

    // Step 1 — upsert spec
    console.log(`[1/2] Upserting spec '${specName}' (type=W)...`);
    const existingSpec = await client.query(
      'SELECT etgo_sf_spec_id FROM etgo_sf_spec WHERE name = $1',
      [specName],
    );
    const existingSpecId = existingSpec.rows.length > 0
      ? existingSpec.rows[0].etgo_sf_spec_id
      : null;
    const specResult = await writerUpsertSpec(client, {
      name: specName,
      moduleId,
      specType: 'W',
      specId: existingSpecId,
      audit: auditOpts,
    });
    const specId = specResult.specId;
    console.log(`       Spec ID: ${specId} (${specResult.created ? 'created' : 'updated'})`);

    // Step 2 — upsert entity
    console.log(`[2/2] Upserting entity '${entityName}' (qualifier='${javaQualifier}')...`);
    const existingEntity = await client.query(
      `SELECT etgo_sf_entity_id FROM etgo_sf_entity
       WHERE etgo_sf_spec_id = $1 AND name = $2`,
      [specId, entityName],
    );

    if (existingEntity.rows.length > 0) {
      const entityId = existingEntity.rows[0].etgo_sf_entity_id;
      await client.query(
        `UPDATE etgo_sf_entity
         SET java_qualifier = $1, updated = now()
         WHERE etgo_sf_entity_id = $2`,
        [javaQualifier, entityId],
      );
      console.log(`       Updated entity ${entityId}`);
    } else {
      const { generateId } = await import('./neo-writer.js');
      const entityId = generateId();
      const adClientId = auditOpts.ad_client_id || '0';
      const adOrgId    = auditOpts.ad_org_id    || '0';
      const createdBy  = auditOpts.createdby     || '0';
      await client.query(
        `INSERT INTO etgo_sf_entity
         (etgo_sf_entity_id, etgo_sf_spec_id, name, ad_module_id, java_qualifier,
          isget, ispost, isput, ispatch, isdelete, seqno,
          ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby)
         VALUES ($1,$2,$3,$4,$5,'Y','Y','N','N','N',10,$6,$7,'Y',NOW(),$8,NOW(),$8)`,
        [entityId, specId, entityName, moduleId, javaQualifier,
         adClientId, adOrgId, createdBy],
      );
      console.log(`       Created entity ${entityId}`);
    }

    await client.query('COMMIT');
    console.log(`\nDone. Custom window '${specName}' configured in NEO.`);
    console.log('Remember to run ./gradlew export.database in the Etendo root.');
    return { dryRun: false, specName, specId, javaQualifier };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await closePool(pool);
  }
}

// ---------------------------------------------------------------------------
// --dump-delta — emit the writes push-to-neo WOULD make, without writing
// ---------------------------------------------------------------------------

/**
 * Resolve the default prev-XML directory:
 *   ${ETENDO_ROOT}/modules/com.etendoerp.go/src-db/database/sourcedata
 * Falls back to the conventional sibling location `../modules/...` relative
 * to this repo root.
 */
function resolveDefaultPrevXmlDir(projectRoot) {
  const etendoRoot = process.env.ETENDO_ROOT
    || join(projectRoot, '..');
  return join(
    etendoRoot,
    'modules', 'com.etendoerp.go', 'src-db', 'database', 'sourcedata',
  );
}

/**
 * Compute and serialize the would-be push as JSON.
 *
 * @param {string} windowName - artifact directory name (kebab-case spec)
 * @param {object} options
 * @param {string} options.outPath - destination file (e.g. artifacts/<spec>/neo-delta.json)
 * @param {string} [options.prevXmlDir]
 * @param {string} [options.projectRoot]
 * @param {string} [options.moduleId]
 * @returns {Promise<{ outPath, summary }>}
 */
export async function dumpDelta(windowName, options) {
  if (!options || !options.outPath) {
    throw new Error('dumpDelta: options.outPath is required');
  }
  const projectRoot = options.projectRoot || ROOT;
  const moduleId = options.moduleId || '94E1B433CF55451EABB764750AC5902A';
  const artifactsDir = join(projectRoot, 'artifacts', windowName);

  // 1) Load the contract / schema-raw / decisions ----------------------------
  const { contract, schemaRawData, decisionsData } =
    await loadPushArtifacts(artifactsDir, windowName);

  // 2) Guard: only window specs are supported in this slice.
  const specType = contract.backendContract?.specType
    || contract.specType
    || 'W';
  if (specType !== 'W') {
    throw new Error(
      `--dump-delta currently supports windows only (specType=W). ` +
      `Found specType=${specType} for '${windowName}'. Tracked for Slice 3+.`
    );
  }

  const windowId = resolveWindowId(schemaRawData, contract, options);
  const specName = windowName;

  // 3) Query AD metadata for tabs+columns. These hit the DB unless the caller
  //    set FROM_CACHE=1 (via setCacheMode in regen-all.js or extract CLIs),
  //    in which case the cache stub answers — no real connection opens.
  const pool = createDbPool(options.dbConfig);
  let adTabs;
  let adColumns;
  try {
    const tabsRes = await pool.query(
      `SELECT ad_tab_id, name, ad_table_id, seqno
       FROM ad_tab
       WHERE ad_window_id = $1 AND isactive = 'Y'
       ORDER BY seqno, name, ad_tab_id`,
      [String(windowId)],
    );
    adTabs = tabsRes.rows;
    const colsRes = await pool.query(
      `SELECT DISTINCT c.ad_table_id, c.ad_column_id, c.columnname, c.position
       FROM ad_column c
       JOIN ad_tab t ON t.ad_table_id = c.ad_table_id
       WHERE t.ad_window_id = $1
         AND t.isactive = 'Y'
         AND c.isactive = 'Y'
       ORDER BY c.ad_table_id, c.position, c.columnname, c.ad_column_id`,
      [String(windowId)],
    );
    adColumns = colsRes.rows;
  } finally {
    await closePool(pool);
  }

  // 4) Load prev-XML snapshot (hard error if missing).
  const prevXmlDir = options.prevXmlDir || resolveDefaultPrevXmlDir(projectRoot);
  const prevSnapshot = await loadEtgoXmlSnapshot(prevXmlDir);

  // 5) Compute and serialize.
  const delta = computeWindowDelta({
    specName,
    windowId: String(windowId),
    moduleId,
    contract,
    decisions: decisionsData,
    adTabs,
    adColumns,
    prevSnapshot,
    schemaRawData,
  });
  const serialized = serializeDelta(delta);

  // 6) Write to disk (pretty JSON, deterministic).
  await mkdir(dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, JSON.stringify(serialized, null, 2) + '\n', 'utf-8');

  const summary = {
    spec: specName,
    upserts: {
      ETGO_SF_SPEC:   serialized.tables.ETGO_SF_SPEC.upserts.length,
      ETGO_SF_ENTITY: serialized.tables.ETGO_SF_ENTITY.upserts.length,
      ETGO_SF_FIELD:  serialized.tables.ETGO_SF_FIELD.upserts.length,
    },
    deletes: {
      ETGO_SF_SPEC:   serialized.tables.ETGO_SF_SPEC.deletes.length,
      ETGO_SF_ENTITY: serialized.tables.ETGO_SF_ENTITY.deletes.length,
      ETGO_SF_FIELD:  serialized.tables.ETGO_SF_FIELD.deletes.length,
    },
  };
  return { outPath: options.outPath, summary };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Extract a `--flag=value` or `--flag value` pair from argv.
 * Returns null if the flag is absent.
 */
function readFlagValue(args, flagName) {
  const eqForm = args.find(a => a.startsWith(`${flagName}=`));
  if (eqForm) return eqForm.split('=').slice(1).join('=');
  const idx = args.indexOf(flagName);
  if (idx >= 0 && idx + 1 < args.length && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const typeIdx = args.indexOf('--type');
  const typeVal = typeIdx >= 0 ? args[typeIdx + 1] : null;
  const isReport = typeVal === 'report';
  const isCustom = typeVal === 'custom';
  const overrideWindowArg = args.find(a => a.startsWith('--override-window='));
  const overrideWindow = overrideWindowArg ? overrideWindowArg.split('=')[1] : null;
  const dumpDeltaPath = readFlagValue(args, '--dump-delta');
  const prevXmlDir = readFlagValue(args, '--prev-xml-dir');

  // The positional spec name is the first non-flag arg, but we must skip the
  // value tokens consumed by --dump-delta / --prev-xml-dir / --type when given
  // as separate words.
  const consumed = new Set();
  for (const flag of ['--dump-delta', '--prev-xml-dir', '--type']) {
    const idx = args.indexOf(flag);
    if (idx >= 0 && idx + 1 < args.length && !args[idx + 1].startsWith('--')) {
      consumed.add(idx + 1);
    }
  }
  const name = args.find((a, i) => !a.startsWith('--') && a !== 'report' && a !== 'custom' && !consumed.has(i));

  if (!name) {
    console.error('Usage:');
    console.error('  node cli/src/push-to-neo.js <windowName> [--dry-run] [--override-window=123]');
    console.error('  node cli/src/push-to-neo.js <reportName> --type report [--dry-run]');
    console.error('  node cli/src/push-to-neo.js <windowName> --type custom [--dry-run]');
    console.error('  node cli/src/push-to-neo.js <windowName> --dump-delta <path> [--prev-xml-dir <dir>]');
    console.error('');
    console.error('Examples:');
    console.error('  node cli/src/push-to-neo.js sales-order');
    console.error('  node cli/src/push-to-neo.js aging-receivable --type report');
    console.error('  node cli/src/push-to-neo.js not-posted-documents --type custom');
    console.error('  node cli/src/push-to-neo.js sales-order --dump-delta artifacts/sales-order/neo-delta.json');
    process.exit(1);
  }

  try {
    if (dumpDeltaPath) {
      if (isReport) {
        throw new Error('--dump-delta is incompatible with --type report (Slice 2: windows only)');
      }
      const { outPath, summary } = await dumpDelta(name, {
        outPath: dumpDeltaPath,
        prevXmlDir: prevXmlDir || undefined,
      });
      console.log(`Delta written to ${outPath}`);
      console.log(`  upserts: ${JSON.stringify(summary.upserts)}`);
      console.log(`  deletes: ${JSON.stringify(summary.deletes)}`);
      return;
    }

    let result;
    if (isReport) {
      result = await pushReportToNeo(name, { dryRun });
    } else if (isCustom) {
      result = await pushCustomWindowToNeo(name, { dryRun });
    } else {
      result = await pushToNeo(name, { dryRun, overrideWindow });
    }
    if (!dryRun) {
      console.log('\nResult:', JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Run CLI when executed directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
