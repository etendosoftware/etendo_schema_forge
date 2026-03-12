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

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDbPool, closePool } from './db.js';
import {
  upsertSpec as writerUpsertSpec,
  populateSpec as writerPopulateSpec,
  upsertField as writerUpsertField,
} from './neo-writer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

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
    .replace(/^-|-$/g, '')                    // trim leading/trailing dashes
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
        fieldName: field.name,
        column: field.column,
        visibility: field.visibility,
      });
    }
  }
  return fields;
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
 * @param {string} [options.moduleId='0'] - AD_Module_ID for new rows
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

  // Load artifacts
  let contractRaw, schemaRaw;
  try {
    contractRaw = await readFile(join(artifactsDir, 'contract.json'), 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read contract.json for window '${windowName}': ${err.message}`);
  }
  try {
    schemaRaw = await readFile(join(artifactsDir, 'schema-curated.json'), 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read schema-curated.json for window '${windowName}': ${err.message}`);
  }

  const contract = JSON.parse(contractRaw);
  const schema = JSON.parse(schemaRaw);

  const windowId = schema.window.id;
  const windowDisplayName = schema.window.name;
  const specName = toSpecName(windowDisplayName);

  // Extract all fields from backend contract
  const allFields = extractFieldsFromContract(contract.backendContract);

  // Dry run mode — plan generation without DB writes
  if (options.dryRun === true) {
    const plan = {
      spec: {
        action: 'upsertSpec',
        params: { windowId, name: specName, specType: 'W' },
      },
      populate: {
        action: 'populateSpec',
        params: { specId: '(from step 1)' },
      },
      fields: allFields.map(f => {
        const vis = mapVisibility(f.visibility);
        return {
          action: 'upsertField',
          entityName: f.entityName,
          params: {
            entityId: '(from populate)',
            column: f.column,
            isIncluded: vis.isIncluded,
            isReadOnly: vis.isReadOnly,
          },
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

  // Live mode — write to DB via transaction
  const moduleId = options.moduleId || '0';
  const auditOpts = options.audit || {};
  const pool = createDbPool(options.dbConfig);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Step 1: Upsert spec
    console.log(`[1/3] Upserting spec '${specName}' for window ${windowId}...`);
    const specResult = await writerUpsertSpec(client, {
      name: specName,
      moduleId,
      windowId,
      specType: 'W',
      audit: auditOpts,
    });
    const specId = specResult.specId;
    console.log(`       Spec ID: ${specId} (${specResult.created ? 'created' : 'updated'})`);

    // Step 2: Populate spec from AD metadata
    console.log(`[2/3] Populating spec from AD metadata...`);
    const popResult = await writerPopulateSpec(client, {
      specId,
      moduleId,
      audit: auditOpts,
    });

    // Build entity name -> entityId map from populate result
    const entityMap = {};
    for (const ent of popResult.entities) {
      entityMap[ent.name] = ent.entityId;
    }
    console.log(`       Entities populated: ${popResult.entityCount}, Fields: ${popResult.fieldCount}`);

    // Step 3: Update field visibility from contract
    console.log(`[3/3] Updating ${allFields.length} fields from contract visibility...`);
    let successCount = 0;
    let errorCount = 0;
    const fieldResults = [];

    for (const f of allFields) {
      const entityId = entityMap[f.entityName];
      if (!entityId) {
        console.warn(`  Warning: No entity ID found for '${f.entityName}', skipping field '${f.column}'`);
        errorCount++;
        fieldResults.push({ column: f.column, entityName: f.entityName, success: false, error: 'no entity' });
        continue;
      }

      const vis = mapVisibility(f.visibility);

      // Find the field by entity + column name (look up column ID first)
      const colLookup = await client.query(
        `SELECT sf.etgo_sf_field_id
         FROM etgo_sf_field sf
         JOIN ad_column c ON c.ad_column_id = sf.ad_column_id
         WHERE sf.etgo_sf_entity_id = $1 AND c.columnname = $2`,
        [entityId, f.column],
      );

      if (colLookup.rows.length === 0) {
        // Field might have been excluded as a system column — skip silently
        fieldResults.push({ column: f.column, entityName: f.entityName, success: true, skipped: true });
        successCount++;
        continue;
      }

      const fieldId = colLookup.rows[0].etgo_sf_field_id;
      await writerUpsertField(client, {
        entityId,
        fieldId,
        moduleId,
        isIncluded: vis.isIncluded,
        isReadOnly: vis.isReadOnly,
        audit: auditOpts,
      });
      fieldResults.push({ column: f.column, entityName: f.entityName, success: true });
      successCount++;
    }

    await client.query('COMMIT');

    console.log(`\nDone. ${successCount} fields updated, ${errorCount} errors.`);

    return {
      dryRun: false,
      specName,
      specId,
      windowId,
      entitiesPopulated: popResult.entityCount,
      fieldsUpdated: successCount,
      fieldsErrored: errorCount,
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
 * @param {string} [options.moduleId='0'] - AD_Module_ID for new rows
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
  const moduleId = options.moduleId || '0';
  const auditOpts = options.audit || {};
  const pool = createDbPool(options.dbConfig);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Step 1: Upsert spec
    console.log(`[1/2] Upserting spec '${specName}' for process ${processId}...`);
    const specResult = await writerUpsertSpec(client, {
      name: specName,
      moduleId,
      processId,
      specType,
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
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const windowName = args.find(a => !a.startsWith('--'));

  if (!windowName) {
    console.error('Usage: node cli/src/push-to-neo.js <windowName> [--dry-run]');
    console.error('Example: node cli/src/push-to-neo.js sales-order');
    process.exit(1);
  }

  try {
    const result = await pushToNeo(windowName, { dryRun });
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
